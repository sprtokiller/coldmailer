import { sendStream, setResponseHeaders } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requirePermission } from '~/server/utils/permissions'
import { streamStepAI, modelForStep } from '~/server/utils/ai'
import { runPartnerIdentification } from '~/server/utils/partner-identification'
import { findOrCreateGlobalRecord } from '~/server/utils/global-record'
import { trackAIUsage, isOverBudget } from '~/server/utils/usage-tracker'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { libraryScopeForProject } from '~/server/utils/libraryScope'
// STEP_SYSTEM_PROMPTS kept only as fallback for steps not yet seeded in DB.
import { STEP_SYSTEM_PROMPTS, GROUP_FONTS, STEP_OUTPUT_SCHEMAS, formatSchemaForPrompt } from '~/config/pipeline'

const STEP_PERMISSION_MAP: Record<string, 'pipeline.serpapi' | 'pipeline.deep_research' | 'pipeline.claude' | 'pipeline.gmail'> = {
  PARTNER_IDENTIFICATION: 'pipeline.serpapi',
  MARKET_SCANNING: 'pipeline.deep_research',
  PARTNER_PROFILING: 'pipeline.deep_research',
  VALUE_ALIGNMENT: 'pipeline.claude',
  OUTREACH_PREPARATION: 'pipeline.claude',
}

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

  const stepPerm = STEP_PERMISSION_MAP[body.stepType]
  if (stepPerm) {
    await requirePermission(event, stepPerm)
  }

  // Budget enforcement: reject if user has exceeded their limit (with lazy period reset)
  const { over, limitUsd } = await isOverBudget(user.id)
  if (over) {
    throw createError({ statusCode: 402, statusMessage: `Překročen budget limit ($${limitUsd!.toFixed(2)} USD)` })
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { project: { include: { group: true } } },
  })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline run not found' })

  if (run.mode === 'short' && (body.stepType === 'MARKET_SCANNING' || body.stepType === 'PARTNER_IDENTIFICATION')) {
    throw createError({ statusCode: 400, statusMessage: 'Zkrácená pipeline nepodporuje tento krok.' })
  }

  const scopeFilter = libraryScopeForProject(run.project)

  const alreadyRunning = await prisma.pipelineStep.findFirst({
    where: { pipelineRunId: runId, status: 'RUNNING' },
    include: { runner: { select: { name: true } } },
  })
  if (alreadyRunning) {
    throw createError({
      statusCode: 409,
      statusMessage: `Krok ${alreadyRunning.stepType} právě běží (spustil/a ${alreadyRunning.runner?.name ?? 'neznámý'}).`,
    })
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
    throw createError({ statusCode: 403, statusMessage: 'Některé kontextové části nejsou dostupné pro tento projekt.' })
  }
  if (body.systemPromptId && !customPrompt) {
    throw createError({ statusCode: 403, statusMessage: 'Vybraný prompt není dostupný pro tento projekt.' })
  }
  if (body.sellingPointId && !sellingPoint) {
    throw createError({ statusCode: 403, statusMessage: 'Vybraný prodejní argument není dostupný pro tento projekt.' })
  }
  if (body.emailDraftId && !emailDraft) {
    throw createError({ statusCode: 403, statusMessage: 'Vybraná e-mailová šablona není dostupná pro tento projekt.' })
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

  // Inject canonical partner industry tags for PARTNER_PROFILING
  let industryTagsContext: string[] = []
  if (body.stepType === 'PARTNER_PROFILING') {
    const tagRow = await prisma.systemConfig.findUnique({ where: { key: 'tags.partnerIndustry' } })
    const tags = Array.isArray(tagRow?.value) ? tagRow!.value as string[] : []
    if (tags.length > 0) {
      industryTagsContext = [`Povolené hodnoty pro pole "industry" (vyber JEDNU z tohoto seznamu):\n${tags.join(', ')}`]
    }
  }

  const allContextParts = [
    ...contextParts.map(c => `${c.name}:\n${c.content}`),
    ...(sellingPoint ? [`Prodejní argumenty (${sellingPoint.name}):\n${sellingPoint.content}`] : []),
    ...(body.manualContext?.trim() ? [`Vlastní kontext:\n${body.manualContext}`] : []),
    ...industryTagsContext,
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
            // Read actual selection from DB — overrides client-sent inputData
            const msStep = await prisma.pipelineStep.findFirst({
              where: { pipelineRunId: runId, stepType: 'MARKET_SCANNING' },
              orderBy: { createdAt: 'desc' },
            })
            let piInputData: Record<string, unknown> = body.inputData ?? {}
            if (msStep) {
              const selectedRefs = await prisma.pipelineRecordRef.findMany({
                where: { stepId: msStep.id, isSelectedForProcessing: true },
                include: { globalRecord: { select: { payload: true, canonicalName: true } } },
                orderBy: { addedAt: 'asc' },
              })
              if (selectedRefs.length > 0) {
                piInputData = { items: selectedRefs.map(r => ({ ...(r.globalRecord.payload as Record<string, unknown>), name: r.globalRecord.canonicalName })) }
              }
            }
            const gen = runPartnerIdentification({
              inputData: piInputData,
              extractPrompt: systemPromptText,
              stepId: step.id,
              pipelineRunId: runId,
              userId: user.id,
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
          } else if (body.stepType === 'PARTNER_PROFILING') {
            // inputData: { partners: [{ partnerId?, name, frequency?, itemNames? }] }
            const inputPartners = (() => {
              const d = body.inputData
              if (Array.isArray(d)) return d
              const p = (d as Record<string, unknown> | undefined)?.partners
              if (Array.isArray(p)) return p
              return []
            })() as Array<{ partnerId?: string; name: string; frequency?: number; itemNames?: string[] }>

            if (inputPartners.length === 0) {
              throw new Error('Žádní partneři k prozkoumání. Vyberte je z výsledků Kroku 2.')
            }

            // Enrich each partner with GlobalRecord details
            const partnerIds = inputPartners.filter(p => p.partnerId).map(p => p.partnerId!)
            const globalRecords = await prisma.globalRecord.findMany({
              where: { id: { in: partnerIds } },
              select: { id: true, canonicalName: true, payload: true },
            })
            const dbMap = new Map(globalRecords.map(gr => {
              const p = gr.payload as Record<string, unknown>
              return [gr.id, {
                id: gr.id,
                name: gr.canonicalName,
                website: (p.website ?? p.url ?? null) as string | null,
                description: (p.description ?? null) as string | null,
                type: (p.type ?? null) as string | null,
              }] as const
            }))

            const allProfiles: unknown[] = []
            const ppProgressItems: Array<{ index: number; total: number; name: string; status: string; error?: string }> = []

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]
              const db = ip.partnerId ? dbMap.get(ip.partnerId) : undefined

              const ppItem = { index: i + 1, total: inputPartners.length, name: ip.name, status: 'processing' }
              ppProgressItems.push(ppItem)
              write({ profilingItem: ppItem })
              prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: ppProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              write({ chunk: `\n── [${i + 1}/${inputPartners.length}] ${ip.name}\n` })

              const userMsg = [
                'Prozkoumej tohoto kandidáta na partnerství a vrať strukturovaný JSON definovaný v systémovém promptu. Veškerá textová pole piš v češtině.',
                '',
                `Název: ${ip.name}`,
                db?.website     ? `Web: ${db.website}` : null,
                db?.description ? `Popis: ${db.description}` : null,
                db?.type        ? `Typ partnerství: ${db.type}` : null,
                ip.frequency    ? `Nalezen v ${ip.frequency} kontextu/kontextech: ${(ip.itemNames ?? []).join(', ')}` : null,
              ].filter(Boolean).join('\n')

              try {
                let partnerOutput = ''
                const { stream: aiStream, getCost } = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: allContextParts,
                  userMessage: userMsg,
                })
                for await (const chunk of aiStream) {
                  partnerOutput += chunk
                  write({ chunk })
                }
                await trackCost(getCost, user.id, { model: modelForStep(body.stepType), pipelineStepId: step.id, stepType: body.stepType })
                const parsedResult = parseAIOutput(partnerOutput)
                const cleaned = stripMarkdownArtifacts(parsedResult.data)
                const profile = {
                  partnerId: ip.partnerId,
                  name: ip.name,
                  ...((typeof cleaned === 'object' && cleaned !== null && !Array.isArray(cleaned))
                    ? cleaned
                    : { raw: partnerOutput }),
                }
                allProfiles.push(profile)
                ppProgressItems[i] = { ...ppProgressItems[i], status: 'done' }
                write({ profilingItem: { index: i + 1, total: inputPartners.length, name: ip.name, status: 'done', profile } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: ppProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allProfiles.push({ partnerId: ip.partnerId, name: ip.name, error: msg })
                ppProgressItems[i] = { ...ppProgressItems[i], status: 'error', error: msg }
                write({ profilingItem: { index: i + 1, total: inputPartners.length, name: ip.name, status: 'error', error: msg } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: ppProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              }
            }

            write({ chunk: `\n✅ Hotovo! Prozkoumáno ${inputPartners.length} partnerů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allProfiles as never, completedAt: new Date(), progress: Prisma.DbNull },
            })

            // Persist profile data back to GlobalRecord so the Database page can display it
            const { syncProfileContactsToDb } = await import('~/server/utils/sync-contacts')
            for (const profile of allProfiles as Array<Record<string, unknown>>) {
              if (profile.error) continue
              const { partnerId: _, error: __, raw: ___, name: profileName, ...profileData } = profile
              const pid = profile.partnerId as string | undefined
              let existingGr = pid
                ? await prisma.globalRecord.findUnique({ where: { id: pid }, select: { id: true, payload: true } })
                : null
              if (!existingGr && profileName) {
                const { normalizeName } = await import('~/server/utils/deduplication')
                existingGr = await prisma.globalRecord.findFirst({
                  where: { type: 'PARTNER', normalizedName: normalizeName(String(profileName)) },
                  select: { id: true, payload: true },
                })
              }
              if (!existingGr) continue

              if (Array.isArray(profile.contacts)) {
                await syncProfileContactsToDb(existingGr.id, profile.contacts as any[])
              }

              const stripMd = (s: string) => s.replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/ {2,}/g, ' ').trim()
              const cleaned: Record<string, unknown> = { name: profileName, ...profileData }
              for (const key of Object.keys(cleaned)) {
                const v = cleaned[key]
                if (typeof v === 'string' && v.includes('](')) {
                  cleaned[key] = stripMd(v)
                } else if (Array.isArray(v)) {
                  cleaned[key] = v.map(item => typeof item === 'string' && item.includes('](') ? stripMd(item) : item)
                }
              }
              const merged = {
                ...((existingGr.payload as Record<string, unknown>) ?? {}),
                ...cleaned,
              }
              await prisma.globalRecord.update({
                where: { id: existingGr.id },
                data: { payload: merged as never },
              }).catch(() => {})
            }
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
                })
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
              write({ profilingItem: opItem })
              prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              write({ chunk: `\n── [${i + 1}/${inputPartners.length}] ${ip.name}\n` })

              const partnerDataBlock = '```json\n' + JSON.stringify(ip, null, 2) + '\n```'

              const outreachSystemPrompt = systemPromptText
                .replace('<[[DATA]]>', partnerDataBlock)
                .replace('<[[CONTEXT]]>', contextBlock)
                .replace('<[[TEMPLATE]]>', templateSection)
                .replace('<[[USER]]>', user.name ?? '')

              const userMsg = [
                'Vytvoř personalizovaný cold e-mail pro tohoto partnera dle systémového promptu.',
                fontFamily ? `Font pro HTML formátování: ${fontFamily}` : null,
              ].filter(s => s !== null).join('\n')

              try {
                let emailOutput = ''
                const { stream: aiStream, getCost } = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: outreachSystemPrompt,
                  contextParts: [],
                  userMessage: userMsg,
                })
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
                write({ profilingItem: { ...opProgressItems[i] } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allEmails.push({ partnerName: String(ip.name ?? ''), error: msg })
                opProgressItems[i] = { ...opProgressItems[i], status: 'error', error: msg }
                write({ profilingItem: { ...opProgressItems[i] } })
                prisma.pipelineStep.update({ where: { id: step.id }, data: { progress: { items: opProgressItems } as Prisma.InputJsonValue } }).catch(() => {})
              }
            }

            write({ chunk: `\n✅ Hotovo! Připraveno ${inputPartners.length} e-mailů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allEmails as never, completedAt: new Date(), progress: Prisma.DbNull },
            })
          } else if (body.stepType === 'MARKET_SCANNING') {
            let fullOutput = ''
            const { stream: aiStream, getCost } = streamStepAI({
              stepType: body.stepType,
              systemPrompt: systemPromptText,
              contextParts: allContextParts,
              userMessage: `${USER_MESSAGE_LABELS[body.stepType] ?? 'Task'}:\n\n${JSON.stringify(body.inputData ?? {}, null, 2)}`,
            })
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

            // GlobalRecord extraction — non-fatal, runs after outputData is persisted
            const msItems = Array.isArray(outputData) ? outputData as Record<string, unknown>[] : []
            if (msItems.length > 0) {
              const inputSource = await prisma.inputSource.create({
                data: {
                  type: 'MINI_DEEP_RESEARCH',
                  pipelineRunId: runId,
                  stepId: step.id,
                  label: `Market Scanning – ${new Date().toLocaleString('cs-CZ')}`,
                  createdBy: user.id,
                  metadata: {
                    config: {
                      systemPromptId: body.systemPromptId ?? null,
                      contextPartIds: body.contextPartIds ?? [],
                      manualContext: body.manualContext ?? '',
                      inputData: (body.inputData ?? {}) as Prisma.InputJsonValue,
                    },
                  } as Prisma.InputJsonValue,
                },
              })
              for (const item of msItems) {
                const name = String(item.name ?? item.nazev ?? item.itemName ?? '')
                if (!name) continue
                const url = String(item.url ?? item.website ?? item.web ?? '') || undefined
                await findOrCreateGlobalRecord(
                  { name, url, type: 'COMPETITION', payload: item },
                  user.id, runId, step.id, inputSource.id, 'GENERATED'
                ).catch((err) => console.error('[MS execute] GlobalRecord link failed for "%s":', name, err))
              }
            }
          } else {
            let fullOutput = ''
            const { stream: aiStream, getCost } = streamStepAI({
              stepType: body.stepType,
              systemPrompt: systemPromptText,
              contextParts: allContextParts,
              userMessage: `${USER_MESSAGE_LABELS[body.stepType] ?? 'Task'}:\n\n${JSON.stringify(body.inputData ?? {}, null, 2)}`,
            })
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
          await prisma.pipelineStep
            .update({
              where: { id: step.id },
              data: { status: 'FAILED', errorMessage: message, completedAt: new Date(), progress: Prisma.DbNull },
            })
            .catch((e) => console.error('[execute] Failed to mark step FAILED:', e))
          write({ error: message })
        } finally {
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

