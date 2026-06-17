import OpenAI from 'openai'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getEffectivePermissions } from '~/server/utils/permissions'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { OPENROUTER, MODELS, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'
import { findOrCreateGlobalRecord } from '~/server/utils/global-record'
import { trackAIUsage } from '~/server/utils/usage-tracker'

interface ImportBody {
  stepType: string
  systemPromptId?: string
  rawInputText: string
}

const SUPPORTED_STEPS = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT']

const STEP_PERMISSION_MAP: Record<string, string> = {
  PARTNER_IDENTIFICATION: 'pipeline.serpapi',
  MARKET_SCANNING: 'pipeline.deep_research',
  PARTNER_PROFILING: 'pipeline.deep_research',
  VALUE_ALIGNMENT: 'pipeline.claude',
}

// Removes deep-research citation annotations like 【7†L76-L79】 that models copy verbatim.
function stripCitationMarks(text: string): string {
  return text.replace(/【[^】]*】/g, '')
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

// Strips legal suffixes, parenthetical qualifiers and punctuation so that
// "EPAM" matches "EPAM Systems (Czech Republic) s.r.o."
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')  // remove (Czech Republic) etc.
    .replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.\s*s\s*r\.?\s*o\.?|z\.?\s*s\.?|o\.?\s*p\.?\s*s\.?|ltd\.?|inc\.?|llc\.?|gmbh\.?|corp\.?|co\.?|group|holding|systems|services|solutions)\b/g, '')
    .replace(/[,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Returns the existing map key that fuzzy-matches newKey, or null if none found.
function fuzzyMatchCompany(
  newKey: string,
  recordMap: Map<string, Record<string, unknown>>,
): string | null {
  const normNew = normalizeCompanyName(newKey)
  if (!normNew) return null
  for (const existingKey of recordMap.keys()) {
    const normExisting = normalizeCompanyName(existingKey)
    if (!normExisting) continue
    if (normExisting === normNew) return existingKey
    // one name is a prefix/substring of the other
    if (normExisting.startsWith(normNew) || normNew.startsWith(normExisting)) return existingKey
  }
  return null
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
  const keyField = (stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT') ? 'name' : 'url'

  const recordMap = new Map<string, Record<string, unknown>>()
  for (const item of existingArr as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (key) recordMap.set(key, item)
  }
  for (const item of newItems as Record<string, unknown>[]) {
    const key = String(item[keyField] ?? item.name ?? '').toLowerCase()
    if (!key) continue
    const matchKey = recordMap.has(key)
      ? key
      : ((stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT') ? fuzzyMatchCompany(key, recordMap) : null)
    if (matchKey !== null) {
      const ex = recordMap.get(matchKey)!
      if (stepType === 'PARTNER_PROFILING') {
        const mergedContacts = mergeContacts(
          Array.isArray(ex.contacts) ? ex.contacts as Record<string, unknown>[] : [],
          Array.isArray(item.contacts) ? item.contacts as Record<string, unknown>[] : [],
        )
        recordMap.set(matchKey, { ...mergeScalar(ex, item), contacts: mergedContacts })
      } else {
        recordMap.set(matchKey, mergeScalar(ex, item))
      }
    } else {
      recordMap.set(key, item)
    }
  }
  return [...recordMap.values()]
}

// If rawText is already valid JSON, return the parsed value directly.
// mergeOutputData handles array/object/wrapper normalisation internally.
function tryExtractValidJSON(rawText: string): unknown | null {
  const { data } = parseAIOutput(rawText.trim())
  return data ?? null
}

async function saveStep(
  existingStep: { id: string } | null,
  runId: string,
  body: ImportBody & { systemPromptId?: string },
  mergedData: unknown,
  runnerId: string,
): Promise<string> {
  if (existingStep) {
    await prisma.pipelineStep.update({
      where: { id: existingStep.id },
      data: { outputData: mergedData as never },
    })
    return existingStep.id
  } else {
    const created = await prisma.pipelineStep.create({
      data: {
        pipelineRunId: runId,
        stepType: body.stepType as never,
        status: 'COMPLETED',
        systemPromptId: body.systemPromptId ?? null,
        contextPartIds: [],
        inputData: {},
        outputData: mergedData as never,
        runnerId,
        completedAt: new Date(),
      },
    })
    return created.id
  }
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

  const stepPerm = STEP_PERMISSION_MAP[body.stepType]
  if (stepPerm) {
    const perms = await getEffectivePermissions(user.id)
    if (!perms.includes(stepPerm)) {
      throw createError({ statusCode: 403, statusMessage: `Nemáte oprávnění: ${stepPerm}` })
    }
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

  const existingData = existingStep?.outputData ?? null

  // If the input is already valid JSON, skip the AI and merge directly.
  const preDetected = tryExtractValidJSON(body.rawInputText)
  if (preDetected !== null) {
    const itemCount = Array.isArray(preDetected) ? preDetected.length : 1
    console.log('[import-ai] input is already valid JSON — skipping AI, merging %d item(s) directly', itemCount)
    const mergedData = mergeOutputData(existingData, preDetected, body.stepType)
    const stepId = await saveStep(existingStep, runId, body, mergedData, user.id)
    await extractMSGlobalRecords(body, mergedData, user.id, runId, stepId)
    return { success: true, mergedData }
  }

  const schemaPrompt = customPrompt?.content ?? dbSystemPrompt?.content ?? STEP_SYSTEM_PROMPTS[body.stepType] ?? ''

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
5. VŠECHNA textová pole (popisky, shrnutí, poznámky, označení) piš VÝHRADNĚ V ČEŠTINĚ. Vlastní jména, URL, e-maily a technické identifikátory ponechej v původní podobě.
6. VŽDY dokonči JSON strukturu — uzavři všechna pole, objekty a řetězce. Pokud by výstup přesahoval limit tokenů, raději SNIŽ počet vrácených položek, ale NIKDY nevracej neúplný JSON. Méně kompletních záznamů je lepší než více neúplných.
7. Pokud vstupní text obsahuje citační značky ve formátu 【N†LX-LY】 nebo jiné anotace nástrojů deep research, NEZAHRNUJ je do výstupního JSON — zcela je vynech ze všech textových polí (sizeNote, summary, note, activities apod.).
8. NIKDY neposkytuj vysvětlení, komentáře ani odůvodnění. VŽDY vrať pouze \`\`\`json blok — i pokud se vstupní data zdají být již v požadovaném formátu. Jakákoli odpověď bez \`\`\`json bloku je chyba.`

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
    model: MODELS.CLAUDE_HAIKU,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: importSystemPrompt },
      { role: 'user', content: userMessage },
    ],
  })

  // Track AI usage (non-fatal)
  try {
    let costUsd = 0
    if (response.id) {
      const apiKey = process.env.OPEN_ROUTER_API_KEY ?? ''
      const costRes = await fetch(
        `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(response.id)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      if (costRes.ok) {
        const costJson = await costRes.json() as { data?: { total_cost?: number } }
        costUsd = costJson.data?.total_cost ?? 0
      }
    }
    await trackAIUsage({
      userId: user.id,
      model: MODELS.CLAUDE_HAIKU,
      costUsd,
      generationId: response.id ?? null,
      pipelineStepId: existingStep?.id,
      stepType: body.stepType,
    })
  } catch (err) {
    console.error('[import-ai] usage tracking failed:', err)
  }

  const finishReason = response.choices[0]?.finish_reason
  const rawOutput = response.choices[0]?.message?.content ?? ''
  const { data: newData, error: parseError } = parseAIOutput(stripCitationMarks(rawOutput))

  if (newData === null) {
    console.error('[import-ai] parse failed. finish_reason=%s length=%d parseError=%s\nRAW OUTPUT:\n%s', finishReason, rawOutput.length, parseError, rawOutput)
    throw createError({
      statusCode: 422,
      statusMessage: `AI returned invalid JSON (length=${rawOutput.length}, finish_reason=${finishReason}, error=${parseError?.slice(0, 120)})`,
    })
  }

  const mergedData = mergeOutputData(existingData, newData, body.stepType)
  const stepId = await saveStep(existingStep, runId, body, mergedData, user.id)
  await extractMSGlobalRecords(body, mergedData, user.id, runId, stepId)
  return { success: true, mergedData }
})

async function extractMSGlobalRecords(
  body: ImportBody,
  mergedData: unknown,
  userId: string,
  pipelineRunId: string,
  stepId: string,
): Promise<void> {
  if (body.stepType !== 'MARKET_SCANNING' && body.stepType !== 'PARTNER_IDENTIFICATION') return

  // Candidates to link: MS = top-level items, PI = unique partners across items
  let candidates: Array<{ name: string; url?: string; payload: Record<string, unknown> }> = []
  if (body.stepType === 'MARKET_SCANNING') {
    const items = Array.isArray(mergedData) ? mergedData as Record<string, unknown>[] : []
    candidates = items
      .map(item => ({
        name: String(item.name ?? item.nazev ?? item.itemName ?? ''),
        url: String(item.url ?? item.website ?? item.web ?? '') || undefined,
        payload: item,
      }))
      .filter(c => c.name)
  } else {
    const items = ((mergedData as { items?: unknown[] } | null)?.items ?? []) as Record<string, unknown>[]
    const byName = new Map<string, { name: string; url?: string; payload: Record<string, unknown> }>()
    for (const item of items) {
      for (const p of ((item.partners as Record<string, unknown>[] | undefined) ?? [])) {
        const name = String(p.name ?? '')
        if (!name || byName.has(name.toLowerCase())) continue
        byName.set(name.toLowerCase(), {
          name,
          url: String(p.website ?? p.url ?? '') || undefined,
          payload: p,
        })
      }
    }
    candidates = [...byName.values()]
  }
  if (candidates.length === 0) return

  const recordType = body.stepType === 'MARKET_SCANNING' ? 'COMPETITION' as const : 'PARTNER' as const
  try {
    const inputSource = await prisma.inputSource.create({
      data: {
        type: 'AI_IMPORT',
        pipelineRunId,
        stepId,
        label: `AI Import – ${new Date().toLocaleString('cs-CZ')}`,
        createdBy: userId,
        metadata: {
          config: {
            systemPromptId: body.systemPromptId ?? null,
            rawInputText: body.rawInputText,
          },
        },
      },
    })
    for (const c of candidates) {
      await findOrCreateGlobalRecord(
        { name: c.name, url: c.url, type: recordType, payload: c.payload },
        userId, pipelineRunId, stepId, inputSource.id, 'IMPORTED'
      ).catch((err) => console.error('[import-ai] GlobalRecord link failed for "%s":', c.name, err))
    }
  } catch {
    // Non-fatal
  }
}
