/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/alignment
 *
 * Spustí VALUE_ALIGNMENT pro jednoho partnera a výsledek uloží do PartnerAlignment.
 * Streamuje SSE: { chunk } | { done, alignmentId } | { error }
 */
import { sendStream, setResponseHeaders } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'
import { getInteractionAccess } from '~/server/utils/projectPermissions'
import { streamStepAI } from '~/server/utils/ai'
import { trackAIUsage, isOverBudget } from '~/server/utils/usage-tracker'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { libraryScopeForProject } from '~/server/utils/libraryScope'
import { startWork } from '~/server/utils/work-registry'
import { STEP_OUTPUT_SCHEMAS, formatSchemaForPrompt, getMissingPlaceholders, renderPromptTemplate, MODELS } from '~/config/pipeline'

interface AlignmentBody {
  systemPromptId?: string
  contextPartIds?: string[]
  sellingPointId?: string
  manualContext?: string
  profileData?: Record<string, unknown> // profilovací data předaná z frontendu
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  const body = await readBody<AlignmentBody>(event)

  const { project } = await requireProjectAccess(event, projectId)

  const access = await getInteractionAccess(user.id, projectId)
  const canManageAll = access.isAdmin || access.canEditAll
  if (!canManageAll) {
    const assignment = await prisma.outreachAssignment.findFirst({
      where: { projectId, globalRecordId, assigneeId: user.id },
      select: { id: true },
    })
    if (!assignment) {
      throw createError({ statusCode: 403, message: 'K tomuto partnerovi nemáte přiřazení.' })
    }
  }

  const { over, limitUsd } = await isOverBudget(user.id)
  if (over) throw createError({ statusCode: 402, message: `Překročen budget limit ($${limitUsd!.toFixed(2)} USD)` })

  const globalRecord = await prisma.globalRecord.findUnique({ where: { id: globalRecordId } })
  if (!globalRecord) throw createError({ statusCode: 404, message: 'Partner nenalezen.' })

  const scopeFilter = libraryScopeForProject(project)
  const STEP = 'VALUE_ALIGNMENT'

  const [contextParts, customPrompt, dbSystemPrompt, sellingPoint] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds }, ...scopeFilter } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({ where: { id: body.systemPromptId, stepType: STEP as never, OR: [{ isSystem: true }, scopeFilter] } })
      : Promise.resolve(null),
    prisma.systemPrompt.findFirst({ where: { stepType: STEP as never, isSystem: true }, orderBy: { createdAt: 'desc' } }),
    body.sellingPointId
      ? prisma.sellingPoint.findFirst({ where: { id: body.sellingPointId, ...scopeFilter } })
      : Promise.resolve(null),
  ])

  const rawPromptText = customPrompt?.content ?? dbSystemPrompt?.content
  if (!rawPromptText) {
    throw createError({ statusCode: 500, message: `Chybí systémový prompt pro krok ${STEP} (databáze není nasazená, spusťte "bun run db:seed").` })
  }
  const missingPlaceholders = getMissingPlaceholders(STEP, rawPromptText)
  if (missingPlaceholders.length) {
    throw createError({ statusCode: 500, message: `Systémový prompt pro krok ${STEP} postrádá povinné placeholdery: ${missingPlaceholders.join(', ')}.` })
  }
  const outputSchema = (customPrompt?.outputSchema as object | null) ?? (dbSystemPrompt?.outputSchema as object | null) ?? STEP_OUTPUT_SCHEMAS[STEP] ?? null

  const contextBlock = [
    ...contextParts.map(c => `${c.name}:\n${c.content}`),
    ...(body.manualContext?.trim() ? [`Vlastní kontext:\n${body.manualContext}`] : []),
  ].join('\n\n')
  const argumentsBlock = sellingPoint?.content ?? ''

  const systemPromptText = renderPromptTemplate(rawPromptText, {
    SCHEMA: outputSchema ? formatSchemaForPrompt(outputSchema) : undefined,
    CONTEXT: contextBlock,
    ARGUMENTS: argumentsBlock,
  })

  // Profil partnera — buď předaný z frontendu, nebo fallback z GlobalRecord.payload
  const profileInput = body.profileData ?? (globalRecord.payload as Record<string, unknown>)

  const userMsg = [
    'Analyzuj soulad mezi tímto partnerem a našimi prodejními argumenty. Vrať strukturovaný JSON dle systémového promptu.',
    '',
    'Profil partnera:',
    '```json',
    JSON.stringify(profileInput, null, 2),
    '```',
  ].join('\n')

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const abortController = new AbortController()
  let finished = false
  event.node.req.on('close', () => {
    if (!finished) abortController.abort(new Error('Přerušeno klientem'))
  })

  // Trackování v registru práce — zrušení ze záložky Práce přeruší AI stream.
  const work = startWork({
    kind: 'AI_ALIGNMENT',
    label: `Value Alignment — ${globalRecord.canonicalName}`,
    userId: user.id,
    projectId,
    globalRecordId,
    cancellable: true,
    onCancel: () => abortController.abort(new Error('Zrušeno uživatelem')),
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const write = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const execute = async () => {
        try {
          let output = ''
          const { stream: aiStream, getCost } = streamStepAI({ stepType: STEP, systemPrompt: systemPromptText, userMessage: userMsg }, undefined, abortController.signal)
          for await (const chunk of aiStream) {
            output += chunk
            work.setProgress(output.length, null, 'Generuje se…')
            write({ chunk })
          }
          finished = true
          try {
            const costUsd = await getCost()
            await trackAIUsage({ userId: user.id, model: MODELS.CLAUDE_SONNET, costUsd, stepType: STEP })
          } catch { /* non-fatal */ }

          const parsed = parseAIOutput(output)
          const alignmentData = (typeof parsed.data === 'object' && parsed.data !== null && !Array.isArray(parsed.data))
            ? parsed.data as Record<string, unknown>
            : { raw: output }

          const saved = await prisma.partnerAlignment.upsert({
            where: { projectId_globalRecordId: { projectId, globalRecordId } },
            create: {
              projectId,
              globalRecordId,
              outputData: alignmentData as never,
              systemPromptId: body.systemPromptId ?? null,
              contextPartIds: body.contextPartIds ?? [],
              sellingPointId: body.sellingPointId ?? null,
              profileSnapshot: profileInput as never,
              authorId: user.id,
            },
            update: {
              outputData: alignmentData as never,
              systemPromptId: body.systemPromptId ?? null,
              contextPartIds: body.contextPartIds ?? [],
              sellingPointId: body.sellingPointId ?? null,
              profileSnapshot: profileInput as never,
              authorId: user.id,
            },
          })

          write({ done: true, alignmentId: saved.id })
          work.complete()
        } catch (err) {
          // Přerušení klientem (zavřený tab / tlačítko Zrušit v UI) není chyba —
          // záznam zahodíme; zrušení ze záložky Práce už mezitím označil cancelWork.
          if (abortController.signal.aborted) work.discard()
          else work.fail(err)
          write({ error: err instanceof Error ? err.message : String(err), done: true })
        } finally {
          controller.close()
        }
      }
      execute()
    },
  })

  return sendStream(event, stream)
})
