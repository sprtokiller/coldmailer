import { sendStream, setResponseHeaders } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { streamStepAI, modelForStep } from '~/server/utils/ai'
import { createGmailDraft, refreshAccessToken } from '~/server/utils/google'
import { runPartnerIdentification } from '~/server/utils/partner-identification'

interface ExecuteBody {
  stepType: string
  systemPromptId?: string
  contextPartIds?: string[]
  sellingPointId?: string
  inputData?: Record<string, unknown>
  searchTermExample?: string
}

const STEP_SYSTEM_PROMPTS: Record<string, string> = {
  MARKET_SCANNING: `You are a market research expert with live web access. Search for high school competitions, events, and channels active in the Czech Republic. Use your web search capability to find real, current examples.

Return a JSON array. Each item must contain exactly these fields:
- url: string — homepage of the competition/event/channel
- name: string — full official name (in the original language)
- type: string — category, e.g. "programming", "mathematics", "robotics", "science", "language", "business"
- level: string — one of "local" | "regional" | "national" | "international"
- status: string — one of "active" | "inactive" | "unknown"
- frequency: string — e.g. "ročně", "pololetně", "jednorázová"
- organizer: string — name of the organizing institution
- description: string — 1–2 sentences describing the competition and what participants do
- target_group: string — primary audience, e.g. "SŠ", "ZŠ", "SŠ+ZŠ"

Example output:
\`\`\`json
[
  {
    "url": "https://olympiada.ksp.mff.cuni.cz",
    "name": "Olympiáda v informatice",
    "type": "programming",
    "level": "national",
    "status": "active",
    "frequency": "ročně",
    "organizer": "MŠMT (ve spolupráci s MFF UK)",
    "description": "Celostátní soutěž pro středoškoláky v řešení algoritmických úloh pomocí programování.",
    "target_group": "SŠ"
  }
]
\`\`\`

Return ONLY the JSON array, no other text or markdown outside the code block.`,
  PARTNER_IDENTIFICATION: `You are a partner research specialist. Analyze the provided webpage content and extract sponsors, partners, or supporting organizations related to the given competition.

Return a JSON array. Each item must contain:
- name: string — official organization name
- website: string|null — their website URL if found on the page
- description: string — what kind of partner they are (1–2 sentences)
- type: string — e.g. "generální partner", "mediální partner", "finanční partner", "technologický partner"

If no partners are found on this page, return an empty array [].
Return ONLY the JSON array, no other text.`,
  PARTNER_PROFILING: `You are a due-diligence analyst with live web access. Research the given organization in depth using web search. Return a JSON object with fields: activities (string), hiringStatus (string), industry (string), pastCollaborations (string[]), summary (string).`,
  CONTACT_DISCOVERY: `You are a contact research specialist with live web access. Find specific contacts at the organization using LinkedIn and other public signals. Priority order: PR > HR > Marketing > CEO > Generic contact. Return a JSON array with fields: name, role, email, linkedin, priority (1-5), confidence (high|medium|low).`,
  VALUE_ALIGNMENT: `You are a strategic alignment analyst. Compare the provided selling points with the partner data and rank alignment opportunities by relevance. Return a JSON array with fields: sellingPoint, relevanceScore (0-100), hook (string), reasoning (string).`,
  OUTREACH_PREPARATION: `You are an expert cold-email copywriter. Generate a highly tailored outreach email based on the provided template, contact, and alignment hints. Return a JSON object with fields: to (email address), subject (string), body (plain text).`,
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

  const [contextParts, customPrompt] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds } } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findUnique({ where: { id: body.systemPromptId } })
      : Promise.resolve(null),
  ])

  const systemPromptText =
    customPrompt?.content ?? STEP_SYSTEM_PROMPTS[body.stepType] ?? 'You are a helpful assistant.'

  const step = await prisma.pipelineStep.create({
    data: {
      pipelineRunId: runId,
      stepType: body.stepType as never,
      status: 'RUNNING',
      systemPromptId: body.systemPromptId ?? null,
      contextPartIds: body.contextPartIds ?? [],
      sellingPointId: body.sellingPointId ?? null,
      inputData: body.inputData ?? {},
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
              searchTermExample: body.searchTermExample ?? '<název soutěže> partneři',
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
