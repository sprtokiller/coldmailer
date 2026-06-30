import { sendStream, setResponseHeaders } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { streamStepAI, modelForStep } from '~/server/utils/ai'
import { runPartnerIdentification } from '~/server/utils/partner-identification'
import { trackAIUsage, isOverBudget } from '~/server/utils/usage-tracker'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { libraryScopeForProject } from '~/server/utils/libraryScope'
import { registerJob, cleanupJob } from '~/server/utils/job-registry'
import { COPY_PROMPT_STEPS } from '~/server/utils/ai'
import { requirePipelineManage } from '~/server/utils/projectPermissions'
// STEP_SYSTEM_PROMPTS kept only as fallback for steps not yet seeded in DB.
import { STEP_SYSTEM_PROMPTS, GROUP_FONTS, STEP_OUTPUT_SCHEMAS, formatSchemaForPrompt } from '~/config/pipeline'

interface ExecuteBody {
  stepType: string
  systemPromptId?: string
  contextPartIds?: string[]
  manualContext?: string
  sellingPointId?: string
  emailDraftId?: string
  inputData?: Record<string, unknown>
}


const USER_MESSAGE_LABELS: Record<string, string> = {
  MARKET_SCANNING:        'Prozkoumej toto téma/odvětví',
  PARTNER_IDENTIFICATION: 'Identifikuj partnery z těchto trhů',
  PARTNER_PROFILING:      'Profiluj tuto organizaci',

  VALUE_ALIGNMENT:        'Srovnej tyto prodejní argumenty s partnerem',
  OUTREACH_PREPARATION:   'Připrav oslovení na základě těchto dat',
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<ExecuteBody>(event)

  if (COPY_PROMPT_STEPS.has(body.stepType)) {
    throw createError({ statusCode: 400, message: `Krok ${body.stepType} používá copy-prompt flow — použijte /import-ai endpoint.` })
  }

  // Budget enforcement: reject if user has exceeded their limit (with lazy period reset)
  const { over, limitUsd } = await isOverBudget(user.id)
  if (over) {
    throw createError({ statusCode: 402, message: `Překročen budget limit ($${limitUsd!.toFixed(2)} USD)` })
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { project: { include: { group: true } } },
  })
  if (!run) throw createError({ statusCode: 404, message: 'Pipeline run not found' })

  const MANAGE_REQUIRED_STEPS = ['PARTNER_IDENTIFICATION']
  if (MANAGE_REQUIRED_STEPS.includes(body.stepType)) {
    await requirePipelineManage(event, run.projectId)
  }

  if (run.mode === 'short' && (body.stepType === 'MARKET_SCANNING' || body.stepType === 'PARTNER_IDENTIFICATION')) {
    throw createError({ statusCode: 400, message: 'Zkrácená pipeline nepodporuje tento krok.' })
  }

  const scopeFilter = libraryScopeForProject(run.project)

  const runningSteps = await prisma.pipelineStep.findMany({
    where: { pipelineRunId: runId, status: 'RUNNING' },
    include: { runner: { select: { name: true } } },
  })
  if (runningSteps.length > 0) {
    const nonProfiling = runningSteps.filter(s => s.stepType !== 'PARTNER_PROFILING')
    if (body.stepType !== 'PARTNER_PROFILING' || nonProfiling.length > 0) {
      const blocker = nonProfiling[0] ?? runningSteps[0]
      throw createError({
        statusCode: 409,
        message: `Krok ${blocker.stepType} právě běží (spustil/a ${blocker.runner?.name ?? 'neznámý'}).`,
      })
    }
    // Parallel PARTNER_PROFILING allowed — check for partner name overlap
    const requestedNames = new Set(
      (body.inputData?.partners as Array<{ name: string }> | undefined)
        ?.map(p => p.name?.toLowerCase().trim())
        .filter(Boolean) ?? [],
    )
    for (const rs of runningSteps) {
      const prog = rs.progress as { items?: Array<{ name: string }> } | null
      for (const item of prog?.items ?? []) {
        const name = item.name?.toLowerCase?.().trim()
        if (name && requestedNames.has(name)) {
          throw createError({
            statusCode: 409,
            message: `Partner "${item.name}" se právě profiluje.`,
          })
        }
      }
    }
  }

  const [contextParts, customPrompt, dbSystemPrompt, sellingPoint, emailDraft] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds }, ...scopeFilter } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({
          where: {
            id: body.systemPromptId,
            OR: [{ isSystem: true }, { isSystem: false, ...scopeFilter }],
          },
        })
      : Promise.resolve(null),
    // Priority lookup: find the isSystem prompt for this step type in DB.
    prisma.systemPrompt.findFirst({
      where: { stepType: body.stepType as never, isSystem: true },
      orderBy: { createdAt: 'desc' },
    }),
    body.sellingPointId
      ? prisma.sellingPoint.findFirst({ where: { id: body.sellingPointId, ...scopeFilter } })
      : Promise.resolve(null),
    body.emailDraftId
      ? prisma.emailDraft.findFirst({ where: { id: body.emailDraftId, ...scopeFilter } })
      : Promise.resolve(null),
  ])

  if (body.contextPartIds?.length && contextParts.length !== new Set(body.contextPartIds).size) {
    throw createError({ statusCode: 403, message: 'Některé kontextové části nejsou dostupné pro tento projekt.' })
  }
  if (body.systemPromptId && !customPrompt) {
    throw createError({ statusCode: 403, message: 'Vybraný prompt není dostupný pro tento projekt.' })
  }
  if (body.sellingPointId && !sellingPoint) {
    throw createError({ statusCode: 403, message: 'Vybraný prodejní argument není dostupný pro tento projekt.' })
  }
  if (body.emailDraftId && !emailDraft) {
    throw createError({ statusCode: 403, message: 'Vybraná e-mailová šablona není dostupná pro tento projekt.' })
  }

  const rawPromptText =
    customPrompt?.content ??
    dbSystemPrompt?.content ??
    STEP_SYSTEM_PROMPTS[body.stepType] ??
    'You are a helpful assistant.'

  const outputSchema =
    (customPrompt?.outputSchema as object | null) ??
    (dbSystemPrompt?.outputSchema as object | null) ??
    STEP_OUTPUT_SCHEMAS[body.stepType] ??
    null

  const systemPromptText = outputSchema
    ? rawPromptText.replace('<[[SCHEMA]]>', formatSchemaForPrompt(outputSchema))
    : rawPromptText

  const allContextParts = [
    ...contextParts.map(c => `${c.name}:\n${c.content}`),
    ...(sellingPoint ? [`Prodejní argumenty (${sellingPoint.name}):\n${sellingPoint.content}`] : []),
    ...(body.manualContext?.trim() ? [`Vlastní kontext:\n${body.manualContext}`] : []),
  ]

  const step = await prisma.pipelineStep.create({
    data: {
      pipelineRunId: runId,
      stepType: body.stepType as never,
      status: 'RUNNING',
      systemPromptId: body.systemPromptId ?? null,
      contextPartIds: body.contextPartIds ?? [],
      sellingPointId: body.sellingPointId ?? null,
      emailDraftId: body.emailDraftId ?? null,
      inputData: (body.inputData ?? {}) as Prisma.InputJsonValue,
      runnerId: user.id,
    },
  })

  const jobController = registerJob(step.id)

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx proxy buffering
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const write = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      write({ stepId: step.id, model: modelForStep(body.stepType) })

      const execute = async () => {
        try {
          if (body.stepType === 'PARTNER_IDENTIFICATION') {
            // Read competitions from MS step's outputData/selectionData — no GlobalRecord for competitions
            const msStep = await prisma.pipelineStep.findFirst({
              where: { pipelineRunId: runId, stepType: 'MARKET_SCANNING' },
              orderBy: { createdAt: 'desc' },
            })
            let piInputData: Record<string, unknown> = body.inputData ?? {}
            if (msStep && Array.isArray(msStep.outputData) && (msStep.outputData as unknown[]).length > 0) {
              const allItems = msStep.outputData as Array<Record<string, unknown>>
              const selectedNames = Array.isArray(msStep.selectionData) ? new Set(msStep.selectionData as string[]) : null
              const items = selectedNames
                ? allItems.filter(item => selectedNames.has(String(item.name ?? item.nazev ?? '')))
                : allItems
              if (items.length > 0) {
                piInputData = { items }
              }
            }
            const gen = runPartnerIdentification({
              inputData: piInputData,
              extractPrompt: systemPromptText,
              stepId: step.id,
              pipelineRunId: runId,
              userId: user.id,
              signal: jobController.signal,
            })
            let finalOutput: unknown = {}
            let partnerIdCostUsd = 0
            const piProgressItems: Array<{ index: number; total: number; itemName: string; status: string; searchTerm?: string; serpResults?: number; pagesLoaded?: number; pages?: Array<{ url: string; title: string; status: string }>; partnersFound?: number; error?: string }> = []
            for await (const ev of gen) {
              if (ev.type === 'progress') write({ chunk: ev.text })
              else if (ev.type === 'item') {
                write({ partnerItem: ev.item })
                const idx = piProgressItems.findIndex(i => i.index === ev.item.index)
                if (idx >= 0) piProgressItems[idx] = { ...ev.item }
                else piProgressItems.push({ ...ev.item })
                await prisma.pipelineStep.update({
                  where: { id: step.id },
                  data: { progress: { items: piProgressItems } as Prisma.InputJsonValue },
                }).catch(() => {})
              } else if (ev.type === 'output') { finalOutput = ev.data; partnerIdCostUsd = ev.totalCostUsd }
            }
            if (partnerIdCostUsd > 0) {
              await trackAIUsage({
                userId:         user.id,
                model:          'pipeline/partner-identification',
                costUsd:        partnerIdCostUsd,
                pipelineStepId: step.id,
                stepType:       body.stepType,
              })
            }
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: finalOutput as never, completedAt: new Date(), progress: Prisma.DbNull },
            })
          } else if (body.stepType === 'VALUE_ALIGNMENT') {
            // inputData: { partners: [<full profile objects from PARTNER_PROFILING>] }
            const inputPartners = (() => {
              const d = body.inputData
              if (Array.isArray(d)) return d
              const p = (d as Record<string, unknown> | undefined)?.partners
              if (Array.isArray(p)) return p
              return []
            })() as Array<Record<string, unknown>>

            if (inputPartners.length === 0) {
              throw new Error('Žádní partneři k analýze. Vyberte je z výsledků Kroku 3.')
            }

            const allAlignments: unknown[] = []
            const vaProgressItems: Array<{ index: number; total: number; name: string; status: string; error?: string }> = []

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]

              const vaItem = { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'processing' }
              vaProgressItems.push(vaItem)
              write({ alignmentItem: vaItem })
              prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: vaProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              write({ chunk: `\n── [${i + 1}/${inputPartners.length}] ${ip.name}\n` })

              const userMsg = [
                'Analyzuj soulad mezi tímto partnerem a našimi prodejními argumenty. Vrať strukturovaný JSON dle systémového promptu.',
                '',
                'Profil partnera:',
                '```json',
                JSON.stringify(ip, null, 2),
                '```',
              ].join('\n')

              try {
                let alignmentOutput = ''
                const { stream: aiStream, getCost } = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: allContextParts,
                  userMessage: userMsg,
                }, undefined, jobController.signal)
                for await (const chunk of aiStream) {
                  alignmentOutput += chunk
                  write({ chunk })
                }
                await trackCost(getCost, user.id, { model: modelForStep(body.stepType), pipelineStepId: step.id, stepType: body.stepType })
                const parsedResult = parseAIOutput(alignmentOutput)
                const alignment = {
                  partnerId: ip.partnerId,
                  name: ip.name,
                  ...((typeof parsedResult.data === 'object' && parsedResult.data !== null && !Array.isArray(parsedResult.data))
                    ? parsedResult.data
                    : { raw: alignmentOutput }),
                }
                allAlignments.push(alignment)
                vaProgressItems[i] = { ...vaProgressItems[i], status: 'done' }
                write({ alignmentItem: { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'done', alignment } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: vaProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allAlignments.push({ partnerId: ip.partnerId, name: ip.name, error: msg })
                vaProgressItems[i] = { ...vaProgressItems[i], status: 'error', error: msg }
                write({ alignmentItem: { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'error', error: msg } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: vaProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              }
            }

            write({ chunk: `\n✅ Hotovo! Analyzováno ${inputPartners.length} partnerů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allAlignments as never, completedAt: new Date(), progress: Prisma.DbNull },
            })
          } else if (body.stepType === 'OUTREACH_PREPARATION') {
            const inputPartners = (() => {
              const d = body.inputData
              if (Array.isArray(d)) return d
              const p = (d as Record<string, unknown> | undefined)?.partners
              if (Array.isArray(p)) return p
              return []
            })() as Array<Record<string, unknown>>

            if (inputPartners.length === 0) {
              throw new Error('Žádní partneři k oslovení. Vyberte je z výsledků Kroku 4 (Value Alignment).')
            }

            const templateSection = emailDraft
              ? [
                  'E-mailová šablona (respektuj tento formát, styl a délku):',
                  `Předmět: ${emailDraft.subject}`,
                  `Tělo:\n${emailDraft.body}`,
                ].join('\n')
              : ''

            const fontFamily = GROUP_FONTS[run.project.group.slug] ?? ''
            const contextBlock = allContextParts.length
              ? allContextParts.join('\n\n')
              : ''

            const allEmails: unknown[] = []
            const opProgressItems: Array<{ index: number; total: number; name: string; status: string; error?: string }> = []

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]
              const opItem = { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'processing' }
              opProgressItems.push(opItem)
              write({ outreachItem: opItem })
              prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              write({ chunk: `\n── [${i + 1}/${inputPartners.length}] ${ip.name}\n` })

              // Strip internal workspace fields before sending to AI
              const { _selectedContact: selectedContact, ...partnerDataClean } = ip
              const partnerDataBlock = '```json\n' + JSON.stringify(partnerDataClean, null, 2) + '\n```'

              const outreachSystemPrompt = systemPromptText
                .replace('<[[DATA]]>', partnerDataBlock)
                .replace('<[[CONTEXT]]>', contextBlock)
                .replace('<[[TEMPLATE]]>', templateSection)
                .replace('<[[USER]]>', user.name ?? '')

              const contactInfo = selectedContact as { firstName?: string | null; lastName?: string | null; role?: string | null; address?: string | null } | undefined
              const contactLine = contactInfo?.address
                ? `Adresát: ${[contactInfo.firstName, contactInfo.lastName].filter(Boolean).join(' ')}${contactInfo.role ? ' (' + contactInfo.role + ')' : ''}, e-mail: ${contactInfo.address}`
                : null

              const userMsg = [
                'Vytvoř personalizovaný cold e-mail pro tohoto partnera dle systémového promptu.',
                contactLine,
                fontFamily ? `Font pro HTML formátování: ${fontFamily}` : null,
              ].filter(Boolean).join('\n')

              try {
                let emailOutput = ''
                const { stream: aiStream, getCost } = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: outreachSystemPrompt,
                  contextParts: [],
                  userMessage: userMsg,
                }, undefined, jobController.signal)
                for await (const chunk of aiStream) {
                  emailOutput += chunk
                  write({ chunk })
                }
                await trackCost(getCost, user.id, { model: modelForStep(body.stepType), pipelineStepId: step.id, stepType: body.stepType })
                const parsedResult = parseAIOutput(emailOutput)
                const emailData = {
                  partnerName: String(ip.name ?? ''),
                  partnerId: ip.partnerId,
                  ...((typeof parsedResult.data === 'object' && parsedResult.data !== null && !Array.isArray(parsedResult.data))
                    ? parsedResult.data
                    : { raw: emailOutput }),
                }
                allEmails.push(emailData)
                opProgressItems[i] = { ...opProgressItems[i], status: 'done' }
                write({ outreachItem: { ...opProgressItems[i] } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allEmails.push({ partnerName: String(ip.name ?? ''), error: msg })
                opProgressItems[i] = { ...opProgressItems[i], status: 'error', error: msg }
                write({ outreachItem: { ...opProgressItems[i] } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              }
            }

            write({ chunk: `\n✅ Hotovo! Připraveno ${inputPartners.length} e-mailů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allEmails as never, completedAt: new Date(), progress: Prisma.DbNull },
            })
          } else {
            let fullOutput = ''
            const { stream: aiStream, getCost } = streamStepAI({
              stepType: body.stepType,
              systemPrompt: systemPromptText,
              contextParts: allContextParts,
              userMessage: `${USER_MESSAGE_LABELS[body.stepType] ?? 'Task'}:\n\n${JSON.stringify(body.inputData ?? {}, null, 2)}`,
            }, undefined, jobController.signal)
            for await (const chunk of aiStream) {
              fullOutput += chunk
              write({ chunk })
            }
            await trackCost(getCost, user.id, { model: modelForStep(body.stepType), pipelineStepId: step.id, stepType: body.stepType })
            const outputData = parseAIOutput(fullOutput).data ?? { raw: fullOutput }
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: outputData as never, completedAt: new Date() },
            })
          }

          write({ done: true, stepId: step.id })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          // Only update if still RUNNING — cancel endpoint may have already set it to FAILED
          await prisma.pipelineStep
            .updateMany({
              where: { id: step.id, status: 'RUNNING' },
              data: { status: 'FAILED', errorMessage: message, completedAt: new Date(), progress: Prisma.DbNull },
            })
            .catch((e) => console.error('[execute] Failed to mark step FAILED:', e))
          write({ error: message, done: true })
        } finally {
          if (jobController.signal.aborted) {
            await prisma.pipelineStep
              .updateMany({
                where: { id: step.id, status: 'COMPLETED' },
                data: { status: 'FAILED', errorMessage: 'Zrušeno uživatelem', completedAt: new Date() },
              })
              .catch((e) => console.error('[execute] Failed to revert aborted step to FAILED:', e))
          }
          cleanupJob(step.id)
          controller.close()
        }
      }

      execute()
    },
  })

  return sendStream(event, stream)
})

function stripMarkdownArtifacts(val: unknown): unknown {
  if (typeof val === 'string') {
    return val
      .replace(/【[^】]*】/g, '')
      .replace(/\(?\[([^\[\]\n]+?)\]\s*\(\s*<?https?:\/\/[^\s)>]+>?(?:\s+["'][^)]*["'])?\s*\)\)?/g, '$1')
  }
  if (Array.isArray(val)) return val.map(stripMarkdownArtifacts)
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) out[k] = stripMarkdownArtifacts(v)
    return out
  }
  return val
}

async function trackCost(
  getCost: () => Promise<number>,
  userId: string,
  opts: { model: string; pipelineStepId: string; stepType: string },
): Promise<void> {
  try {
    const costUsd = await getCost()
    await trackAIUsage({ userId, costUsd, ...opts })
  } catch {
    // Non-fatal
  }
}

