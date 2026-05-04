import { sendStream, setResponseHeaders } from 'h3'
import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { streamStepAI, modelForStep } from '~/server/utils/ai'
import { createGmailDraft, refreshAccessToken } from '~/server/utils/google'
import { runPartnerIdentification } from '~/server/utils/partner-identification'
// STEP_SYSTEM_PROMPTS kept only as fallback for steps not yet seeded in DB.
import { STEP_SYSTEM_PROMPTS } from '~/server/utils/default-prompts'

interface ExecuteBody {
  stepType: string
  systemPromptId?: string
  contextPartIds?: string[]
  sellingPointId?: string
  inputData?: Record<string, unknown>
}


const USER_MESSAGE_LABELS: Record<string, string> = {
  MARKET_SCANNING: 'Research this topic/industry',
  PARTNER_IDENTIFICATION: 'Identify partners from these markets',
  PARTNER_PROFILING: 'Profile this organization',
  CONTACT_DISCOVERY: 'Find contacts at this organization',
  VALUE_ALIGNMENT: 'Align these selling points with this partner',
  OUTREACH_PREPARATION: 'Prepare outreach using this data',
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<ExecuteBody>(event)

  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline run not found' })

  const [contextParts, customPrompt, dbSystemPrompt] = await Promise.all([
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
  ])

  const systemPromptText =
    customPrompt?.content ??
    dbSystemPrompt?.content ??
    STEP_SYSTEM_PROMPTS[body.stepType] ??
    'You are a helpful assistant.'

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
                'Research this potential partnership candidate and return the structured JSON defined in the system prompt:',
                '',
                `Name: ${ip.name}`,
                db?.website     ? `Website: ${db.website}` : null,
                db?.description ? `Known description: ${db.description}` : null,
                db?.type        ? `Partnership type hint: ${db.type}` : null,
                ip.frequency    ? `Found in ${ip.frequency} context(s): ${(ip.itemNames ?? []).join(', ')}` : null,
              ].filter(Boolean).join('\n')

              try {
                let partnerOutput = ''
                const gen = streamStepAI({
                  stepType: body.stepType,
                  systemPrompt: systemPromptText,
                  contextParts: contextParts.map(c => `${c.name}:\n${c.content}`),
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
          } else {
            let fullOutput = ''
            const gen = streamStepAI({
              stepType: body.stepType,
              systemPrompt: systemPromptText,
              contextParts: contextParts.map((c) => `${c.name}:\n${c.content}`),
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
