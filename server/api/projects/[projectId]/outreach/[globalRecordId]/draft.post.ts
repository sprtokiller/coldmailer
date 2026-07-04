/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/draft
 *
 * Spustí OUTREACH_PREPARATION pro jednoho partnera a výsledek uloží do PartnerOutreachDraft.
 * Streamuje SSE: { chunk } | { done, draft } | { error }
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
import { STEP_OUTPUT_SCHEMAS, GROUP_FONTS, formatSchemaForPrompt, getMissingPlaceholders, renderPromptTemplate, MODELS } from '~/config/pipeline'

interface DraftBody {
  systemPromptId?: string
  emailDraftId?: string
  contextPartIds?: string[]
  sellingPointId?: string
  manualContext?: string
  selectedContact?: { firstName?: string | null; lastName?: string | null; role?: string | null; address?: string | null }
  selectedArgumentIds?: string[]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  const body = await readBody<DraftBody>(event)

  const { project } = await requireProjectAccess(event, projectId)

  const access = await getInteractionAccess(user.id, projectId)
  if (!access.isAdmin && !access.canEditAll) {
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

  const [globalRecord, alignment] = await Promise.all([
    prisma.globalRecord.findUnique({ where: { id: globalRecordId } }),
    prisma.partnerAlignment.findUnique({ where: { projectId_globalRecordId: { projectId, globalRecordId } } }),
  ])
  if (!globalRecord) throw createError({ statusCode: 404, message: 'Partner nenalezen.' })
  if (!alignment) throw createError({ statusCode: 400, message: 'Nejprve spusťte Value Alignment pro tohoto partnera.' })

  const scopeFilter = libraryScopeForProject(project)
  const STEP = 'OUTREACH_PREPARATION'

  const [contextParts, customPrompt, dbSystemPrompt, emailDraft, sellingPoint] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds }, ...scopeFilter } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({ where: { id: body.systemPromptId, stepType: STEP as never, OR: [{ isSystem: true }, scopeFilter] } })
      : Promise.resolve(null),
    prisma.systemPrompt.findFirst({ where: { stepType: STEP as never, isSystem: true }, orderBy: { createdAt: 'desc' } }),
    body.emailDraftId
      ? prisma.emailDraft.findFirst({ where: { id: body.emailDraftId, ...scopeFilter } })
      : Promise.resolve(null),
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

  const templateSection = emailDraft
    ? ['E-mailová šablona (respektuj tento formát, styl a délku):', `Předmět: ${emailDraft.subject}`, `Tělo:\n${emailDraft.body}`].join('\n')
    : ''

  const rawPartnerData = alignment.outputData as Record<string, unknown>
  const selectedIds = new Set(body.selectedArgumentIds ?? [])
  const partnerData: Record<string, unknown> = selectedIds.size === 0
    ? rawPartnerData
    : {
        ...rawPartnerData,
        ...(Array.isArray(rawPartnerData.topArguments)
          ? { topArguments: (rawPartnerData.topArguments as Array<Record<string, unknown>>).filter(a => selectedIds.has(String(a.argumentId))) }
          : {}),
        ...(Array.isArray(rawPartnerData.argumentAlignment)
          ? { argumentAlignment: (rawPartnerData.argumentAlignment as Array<Record<string, unknown>>).filter(a => selectedIds.has(String(a.argumentId))) }
          : {}),
      }
  const partnerDataBlock = '```json\n' + JSON.stringify(partnerData, null, 2) + '\n```'
  const fontFamily = GROUP_FONTS[project.group?.slug ?? ''] ?? ''

  const systemPromptText = renderPromptTemplate(rawPromptText, {
    SCHEMA: outputSchema ? formatSchemaForPrompt(outputSchema) : undefined,
    DATA: partnerDataBlock,
    CONTEXT: contextBlock,
    ARGUMENTS: argumentsBlock,
    TEMPLATE: templateSection,
    USER: user.name ?? '',
  })

  const contactInfo = body.selectedContact
  const contactLine = contactInfo?.address
    ? `Adresát: ${[contactInfo.firstName, contactInfo.lastName].filter(Boolean).join(' ')}${contactInfo.role ? ' (' + contactInfo.role + ')' : ''}, e-mail: ${contactInfo.address}`
    : null

  const selectedArgsLine = body.selectedArgumentIds?.length
    ? `Použij výhradně tyto prodejní argumenty (podle argumentId): ${body.selectedArgumentIds.join(', ')}.`
    : null

  const userMsg = [
    'Vytvoř personalizovaný cold e-mail pro tohoto partnera dle systémového promptu.',
    contactLine,
    fontFamily ? `Font pro HTML formátování: ${fontFamily}` : null,
    selectedArgsLine,
  ].filter(Boolean).join('\n')

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
    kind: 'AI_DRAFT',
    label: `Návrh e-mailu — ${globalRecord.canonicalName}`,
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
          const emailData = (typeof parsed.data === 'object' && parsed.data !== null && !Array.isArray(parsed.data))
            ? parsed.data as Record<string, unknown>
            : { raw: output }

          const toAddress = String(emailData.to ?? contactInfo?.address ?? '')
          const subject = String(emailData.subject ?? '')
          const bodyHtml = String(emailData.body ?? output)
          const recommendations = Array.isArray(emailData.recommendations) ? emailData.recommendations.map(String) : []

          const saved = await prisma.partnerOutreachDraft.upsert({
            where: { projectId_globalRecordId: { projectId, globalRecordId } },
            create: { projectId, globalRecordId, toAddress, subject, body: bodyHtml, recommendations, systemPromptId: body.systemPromptId ?? null, emailDraftId: body.emailDraftId ?? null, config: { selectedArgumentIds: body.selectedArgumentIds ?? [] }, savedById: user.id },
            update: { toAddress, subject, body: bodyHtml, recommendations, systemPromptId: body.systemPromptId ?? null, emailDraftId: body.emailDraftId ?? null, config: { selectedArgumentIds: body.selectedArgumentIds ?? [] }, savedById: user.id, savedAt: new Date(), sentAt: null, sendError: null },
          })

          write({ done: true, draft: { id: saved.id, toAddress: saved.toAddress, subject: saved.subject, body: saved.body, recommendations: saved.recommendations } })
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
