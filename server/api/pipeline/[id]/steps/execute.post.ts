import { sendStream, setResponseHeaders } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { streamStepAI, modelForStep } from '~/server/utils/ai'
import { createGmailDraft, refreshAccessToken } from '~/server/utils/google'
import { runPartnerIdentification } from '~/server/utils/partner-identification'
// STEP_SYSTEM_PROMPTS kept only as fallback for steps not yet seeded in DB.
import { STEP_SYSTEM_PROMPTS } from '~/config/pipeline'

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

  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline run not found' })

  const [contextParts, customPrompt, dbSystemPrompt, sellingPoint, emailDraft] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds } } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findUnique({ where: { id: body.systemPromptId } })
      : Promise.resolve(null),
    // Priority lookup: find the isSystem prompt for this step type in DB.
    prisma.systemPrompt.findFirst({
      where: { stepType: body.stepType as never, isSystem: true },
      orderBy: { createdAt: 'desc' },
    }),
    body.sellingPointId
      ? prisma.sellingPoint.findUnique({ where: { id: body.sellingPointId } })
      : Promise.resolve(null),
    body.emailDraftId
      ? prisma.emailDraft.findUnique({ where: { id: body.emailDraftId } })
      : Promise.resolve(null),
  ])

  const systemPromptText =
    customPrompt?.content ??
    dbSystemPrompt?.content ??
    STEP_SYSTEM_PROMPTS[body.stepType] ??
    'You are a helpful assistant.'

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
          if (body.stepType === 'OUTREACH_EXECUTION') {
            write({ chunk: '⟳ Creating draft in Gmail…' })
            const result = await executeGmailStep(user.id, body.inputData)
            write({ chunk: '\n✓ Draft created.' })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: result as never, completedAt: new Date() },
            })
          } else if (body.stepType === 'PARTNER_IDENTIFICATION') {
            const gen = runPartnerIdentification({
              inputData: body.inputData ?? {},
              extractPrompt: systemPromptText,
              stepId: step.id,
            })
            let finalOutput: unknown = {}
            for await (const ev of gen) {
              if (ev.type === 'progress') write({ chunk: ev.text })
              else if (ev.type === 'item') write({ partnerItem: ev.item })
              else if (ev.type === 'output') finalOutput = ev.data
            }
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: finalOutput as never, completedAt: new Date() },
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

            // Enrich each partner with DB details (website, description, type)
            const partnerIds = inputPartners.filter(p => p.partnerId).map(p => p.partnerId!)
            const dbPartners = await prisma.partner.findMany({
              where: { id: { in: partnerIds } },
              select: { id: true, name: true, website: true, description: true, type: true },
            })
            const dbMap = new Map(dbPartners.map(p => [p.id, p]))

            const allProfiles: unknown[] = []

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]
              const db = ip.partnerId ? dbMap.get(ip.partnerId) : undefined

              write({ profilingItem: { index: i + 1, total: inputPartners.length, name: ip.name, status: 'processing' } })
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
                const gen = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: allContextParts,
                  userMessage: userMsg,
                })
                for await (const chunk of gen) {
                  partnerOutput += chunk
                  write({ chunk })
                }
                const parsed = parseAIOutput(partnerOutput)
                const profile = {
                  partnerId: ip.partnerId,
                  name: ip.name,
                  ...((typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
                    ? parsed
                    : { raw: parsed }),
                }
                allProfiles.push(profile)
                write({ profilingItem: { index: i + 1, total: inputPartners.length, name: ip.name, status: 'done', profile } })
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allProfiles.push({ partnerId: ip.partnerId, name: ip.name, error: msg })
                write({ profilingItem: { index: i + 1, total: inputPartners.length, name: ip.name, status: 'error', error: msg } })
              }
            }

            write({ chunk: `\n✅ Hotovo! Prozkoumáno ${inputPartners.length} partnerů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allProfiles as never, completedAt: new Date() },
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

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]

              write({ alignmentItem: { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'processing' } })
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
                const gen = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: allContextParts,
                  userMessage: userMsg,
                })
                for await (const chunk of gen) {
                  alignmentOutput += chunk
                  write({ chunk })
                }
                const parsed = parseAIOutput(alignmentOutput)
                const alignment = {
                  partnerId: ip.partnerId,
                  name: ip.name,
                  ...((typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
                    ? parsed
                    : { raw: parsed }),
                }
                allAlignments.push(alignment)
                write({ alignmentItem: { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'done', alignment } })
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allAlignments.push({ partnerId: ip.partnerId, name: ip.name, error: msg })
                write({ alignmentItem: { index: i + 1, total: inputPartners.length, name: String(ip.name ?? ''), status: 'error', error: msg } })
              }
            }

            write({ chunk: `\n✅ Hotovo! Analyzováno ${inputPartners.length} partnerů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allAlignments as never, completedAt: new Date() },
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
              : null

            const allEmails: unknown[] = []

            for (let i = 0; i < inputPartners.length; i++) {
              const ip = inputPartners[i]
              write({ chunk: `\n── [${i + 1}/${inputPartners.length}] ${ip.name}\n` })

              const userMsg = [
                'Vytvoř personalizovaný cold e-mail pro tohoto partnera. Vrať JSON objekt s poli: to (e-mailová adresa, pokud je k dispozici, jinak prázdný řetězec), subject (string), body (prostý text).',
                '',
                templateSection,
                '',
                'Alignment data partnera (použij top argumenty a doporučený kontakt):',
                '```json',
                JSON.stringify(ip, null, 2),
                '```',
              ].filter(s => s !== null).join('\n')

              try {
                let emailOutput = ''
                const gen = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: allContextParts,
                  userMessage: userMsg,
                })
                for await (const chunk of gen) {
                  emailOutput += chunk
                  write({ chunk })
                }
                const parsed = parseAIOutput(emailOutput)
                const emailData = {
                  partnerName: String(ip.name ?? ''),
                  partnerId: ip.partnerId,
                  ...((typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
                    ? parsed
                    : { raw: parsed }),
                }
                allEmails.push(emailData)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                write({ chunk: `  ❌ ${msg}\n` })
                allEmails.push({ partnerName: String(ip.name ?? ''), error: msg })
              }
            }

            write({ chunk: `\n✅ Hotovo! Připraveno ${inputPartners.length} e-mailů.\n` })
            await prisma.pipelineStep.update({
              where: { id: step.id },
              data: { status: 'COMPLETED', outputData: allEmails as never, completedAt: new Date() },
            })
          } else {
            let fullOutput = ''
            const gen = streamStepAI({
              stepType: body.stepType,
              systemPrompt: systemPromptText,
              contextParts: allContextParts,
              userMessage: `${USER_MESSAGE_LABELS[body.stepType] ?? 'Task'}:\n\n${JSON.stringify(body.inputData ?? {}, null, 2)}`,
            })
            for await (const chunk of gen) {
              fullOutput += chunk
              write({ chunk })
            }
            const outputData = parseAIOutput(fullOutput)
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
              data: { status: 'FAILED', errorMessage: message, completedAt: new Date() },
            })
            .catch(() => {})
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

function parseAIOutput(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = match ? match[1] : text.trim()
  try {
    return JSON.parse(raw)
  } catch {
    return { raw: text }
  }
}

async function executeGmailStep(
  userId: string,
  inputData?: Record<string, unknown>,
): Promise<unknown> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!dbUser?.accessToken) throw new Error('No Gmail access token — re-authenticate.')

  let accessToken = dbUser.accessToken
  if (dbUser.tokenExpiry && dbUser.tokenExpiry < new Date() && dbUser.refreshToken) {
    const config = useRuntimeConfig()
    const refreshed = await refreshAccessToken(
      dbUser.refreshToken,
      config.googleClientId,
      config.googleClientSecret,
    )
    accessToken = refreshed.access_token
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: refreshed.access_token,
        tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    })
  }

  const to = String(inputData?.to ?? '')
  const subject = String(inputData?.subject ?? '')
  const body = String(inputData?.body ?? '')
  if (!to || !subject || !body) throw new Error('inputData must include to, subject, and body')

  const draft = await createGmailDraft(accessToken, to, subject, body)
  return { gmailDraftId: draft.id, threadId: draft.threadId, to, subject }
}
