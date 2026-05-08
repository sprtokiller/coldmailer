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

function mergeScalar(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && v !== '') result[k] = v
  }
  return result
}

function contactKey(c: Record<string, unknown>): string {
  const email = String(c.email ?? '').toLowerCase().trim()
  if (email) return email
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase().trim()
    || String(c.name ?? '').toLowerCase().trim()
  return name
}

function mergeContacts(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const c of existing) {
    const k = contactKey(c)
    if (k) map.set(k, c)
  }
  for (const c of incoming) {
    const k = contactKey(c)
    if (!k) continue
    map.set(k, map.has(k) ? mergeScalar(map.get(k)!, c) : c)
  }
  return [...map.values()]
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

    const itemMap = new Map<string, Record<string, unknown>>()
    for (const item of existingItems) {
      const key = String((item as Record<string, unknown>).itemName ?? '').toLowerCase()
      if (key) itemMap.set(key, item as Record<string, unknown>)
    }
    for (const item of newItems as Record<string, unknown>[]) {
      const key = String(item.itemName ?? '').toLowerCase()
      if (!key) continue
      if (itemMap.has(key)) {
        const ex = itemMap.get(key)!
        const mergedPartners = [
          ...((ex.partners as Record<string, unknown>[] | undefined) ?? []),
          ...((item.partners as Record<string, unknown>[] | undefined) ?? []),
        ].reduce<Record<string, unknown>[]>((acc, p) => {
          const pk = String(p.partnerId ?? p.name ?? '').toLowerCase()
          if (!pk || acc.some(a => String(a.partnerId ?? a.name ?? '').toLowerCase() === pk)) return acc
          return [...acc, p]
        }, [])
        itemMap.set(key, { ...ex, ...item, partners: mergedPartners })
      } else {
        itemMap.set(key, item)
      }
    }
    return { ...(existing as object ?? {}), items: [...itemMap.values()] }
  }

  // MARKET_SCANNING and PARTNER_PROFILING — normalise newData to array
  const newItems: unknown[] = Array.isArray(newData)
    ? newData
    : (typeof newData === 'object' && newData !== null ? [newData] : [])

  if (newItems.length === 0) return existing ?? []

  const existingArr = Array.isArray(existing) ? existing : []
  const keyField = stepType === 'PARTNER_PROFILING' ? 'name' : 'url'

  const recordMap = new Map<string, Record<string, unknown>>()
  for (const item of existingArr as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (key) recordMap.set(key, item)
  }
  for (const item of newItems as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (!key) continue
    if (recordMap.has(key)) {
      const ex = recordMap.get(key)!
      if (stepType === 'PARTNER_PROFILING') {
        const mergedContacts = mergeContacts(
          Array.isArray(ex.contacts) ? ex.contacts as Record<string, unknown>[] : [],
          Array.isArray(item.contacts) ? item.contacts as Record<string, unknown>[] : [],
        )
        recordMap.set(key, { ...mergeScalar(ex, item), contacts: mergedContacts })
      } else {
        recordMap.set(key, mergeScalar(ex, item))
      }
    } else {
      recordMap.set(key, item)
    }
  }
  return [...recordMap.values()]
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

  const importSystemPrompt = `Jsi asistent pro transformaci dat. Převeď nestrukturovaný text do strukturovaného JSON dle níže definovaného schématu.

Definice schématu (ze systémového promptu):
---
${schemaPrompt}
---

PRAVIDLA:
1. Transformuj POUZE dodaný text do přesného JSON formátu popsaného výše.
2. Vrať POUZE platný JSON uvnitř \`\`\`json bloku kódu.
3. NEZAHRNUJ položky, které již existují v poskytnutých stávajících datech.
4. VŽDY vrať JSON POLE (i pokud jde o jediný záznam). Je to nutné pro správné sloučení více importů. Pokud schéma výše říká "single object", zabal ho do pole.
5. VŠECHNA textová pole (popisky, shrnutí, poznámky, označení) piš VÝHRADNĚ V ČEŠTINĚ. Vlastní jména, URL, e-maily a technické identifikátory ponechej v původní podobě.`

  const existingContext = existingData
    ? `\n\nStávající data (pro deduplikaci — NEOPAKUJ tyto záznamy):\n\`\`\`json\n${JSON.stringify(existingData, null, 2).slice(0, 3000)}\n\`\`\``
    : ''

  const userMessage = `Transformuj tento nestrukturovaný text do požadovaného JSON formátu:\n---\n${body.rawInputText}\n---${existingContext}`

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
