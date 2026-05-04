import OpenAI from 'openai'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { OPENROUTER, MODELS, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'

interface ImportBody {
  stepType: string
  systemPromptId?: string
  rawInputText: string
}

const SUPPORTED_STEPS = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING']

function parseAIOutput(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = match ? match[1] : text.trim()
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function mergeOutputData(existing: unknown, newData: unknown, stepType: string): unknown {
  if (stepType === 'PARTNER_IDENTIFICATION') {
    const existingItems = (existing as { items?: unknown[] } | null)?.items ?? []
    const newItems = (() => {
      if (!newData || typeof newData !== 'object') return []
      if (Array.isArray(newData)) return newData
      const d = newData as Record<string, unknown>
      return Array.isArray(d.items) ? d.items : []
    })()
    const existingNames = new Set(
      existingItems.map((i: unknown) =>
        String((i as Record<string, unknown>).itemName ?? '').toLowerCase(),
      ),
    )
    const toAdd = newItems.filter(
      (i: unknown) =>
        !existingNames.has(
          String((i as Record<string, unknown>).itemName ?? '').toLowerCase(),
        ),
    )
    return { ...(existing as object ?? {}), items: [...existingItems, ...toAdd] }
  }

  // For MARKET_SCANNING and PARTNER_PROFILING:
  // The PARTNER_PROFILING schema instructs the AI to return a SINGLE JSON object,
  // so newData may be a plain object rather than an array. Normalise to array so
  // that profilingOutputProfiles() (which requires Array.isArray) can render it.
  const newItems: unknown[] = Array.isArray(newData)
    ? newData
    : (typeof newData === 'object' && newData !== null ? [newData] : [])

  if (newItems.length === 0) return existing ?? []

  const existingArr = Array.isArray(existing) ? existing : []
  const keyField = stepType === 'PARTNER_PROFILING' ? 'name' : 'url'
  const existingKeys = new Set(
    existingArr.map((i: unknown) =>
      String((i as Record<string, unknown>)[keyField] ?? (i as Record<string, unknown>).name ?? '').toLowerCase(),
    ),
  )
  const toAdd = newItems.filter((i: unknown) => {
    const item = i as Record<string, unknown>
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    return key && !existingKeys.has(key)
  })
  return [...existingArr, ...toAdd]
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<ImportBody>(event)

  if (!body.rawInputText?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'rawInputText is required' })
  }
  if (!SUPPORTED_STEPS.includes(body.stepType)) {
    throw createError({ statusCode: 400, statusMessage: `AI Import not supported for step ${body.stepType}` })
  }

  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline run not found' })

  const [customPrompt, dbSystemPrompt, existingStep] = await Promise.all([
    body.systemPromptId
      ? prisma.systemPrompt.findUnique({ where: { id: body.systemPromptId } })
      : Promise.resolve(null),
    prisma.systemPrompt.findFirst({
      where: { stepType: body.stepType as never, isSystem: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.pipelineStep.findFirst({
      where: { pipelineRunId: runId, stepType: body.stepType as never },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const schemaPrompt = customPrompt?.content ?? dbSystemPrompt?.content ?? STEP_SYSTEM_PROMPTS[body.stepType] ?? ''
  const existingData = existingStep?.outputData ?? null

  const importSystemPrompt = `You are a data transformation assistant. Convert unstructured text into structured JSON matching the schema below.

Schema definition (from system prompt):
---
${schemaPrompt}
---

RULES:
1. Transform ONLY the raw input text into the exact JSON format described above.
2. Return ONLY valid JSON inside a \`\`\`json code block.
3. Do NOT include items already present in the existing data provided for context.
4. ALWAYS return a JSON ARRAY (even if there is only one record). This is required so that multiple imports can be merged correctly. If the schema above says "single object", wrap it in an array anyway.`

  const existingContext = existingData
    ? `\n\nExisting data (for deduplication — do NOT repeat these):\n\`\`\`json\n${JSON.stringify(existingData, null, 2).slice(0, 3000)}\n\`\`\``
    : ''

  const userMessage = `Transform this raw text into the required JSON format:\n---\n${body.rawInputText}\n---${existingContext}`

  const client = new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
    defaultHeaders: { 'HTTP-Referer': OPENROUTER.siteUrl, 'X-Title': OPENROUTER.siteTitle },
  })

  const response = await client.chat.completions.create({
    model: MODELS.CLAUDE_SONNET,
    messages: [
      { role: 'system', content: importSystemPrompt },
      { role: 'user', content: userMessage },
    ],
  })

  const rawOutput = response.choices[0]?.message?.content ?? ''
  const newData = parseAIOutput(rawOutput)

  if (newData === null) {
    throw createError({ statusCode: 422, statusMessage: `AI returned invalid JSON. Raw: ${rawOutput.slice(0, 300)}` })
  }

  const mergedData = mergeOutputData(existingData, newData, body.stepType)

  if (existingStep) {
    await prisma.pipelineStep.update({
      where: { id: existingStep.id },
      data: { outputData: mergedData as never },
    })
  } else {
    await prisma.pipelineStep.create({
      data: {
        pipelineRunId: runId,
        stepType: body.stepType as never,
        status: 'COMPLETED',
        systemPromptId: body.systemPromptId ?? null,
        contextPartIds: [],
        inputData: {},
        outputData: mergedData as never,
        runnerId: user.id,
        completedAt: new Date(),
      },
    })
  }

  return { success: true, mergedData }
})
