import OpenAI from 'openai'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { OPENROUTER, MODELS, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'
import { findOrCreateGlobalRecord } from '~/server/utils/global-record'
import { trackAIUsage } from '~/server/utils/usage-tracker'
import { mergeOutputData } from '~/server/utils/merge-output'
import { libraryScopeForProject } from '~/server/utils/libraryScope'
import { requirePipelineManage } from '~/server/utils/projectPermissions'

interface ImportBody {
  stepType: string
  systemPromptId?: string
  rawInputText: string
}

const SUPPORTED_STEPS = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT']

// Removes deep-research citation annotations like 【7†L76-L79】 that models copy verbatim.
function stripCitationMarks(text: string): string {
  return text.replace(/【[^】]*】/g, '')
}


// If rawText is already valid JSON, return the parsed value directly.
// mergeOutputData handles array/object/wrapper normalisation internally.
function tryExtractValidJSON(rawText: string): unknown | null {
  const { data } = parseAIOutput(rawText.trim())
  return data ?? null
}

import { Prisma } from '@prisma/client'

async function saveStep(
  existingStep: { id: string } | null,
  runId: string,
  body: ImportBody & { systemPromptId?: string },
  mergedData: unknown,
  runnerId: string,
): Promise<string> {
  // For MARKET_SCANNING, reset selectionData to null (= all items selected)
  const extraData = body.stepType === 'MARKET_SCANNING' ? { selectionData: Prisma.DbNull } : {}

  if (existingStep) {
    await prisma.pipelineStep.update({
      where: { id: existingStep.id },
      data: { outputData: mergedData as never, ...extraData },
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
    throw createError({ statusCode: 400, message: 'rawInputText is required' })
  }
  if (!SUPPORTED_STEPS.includes(body.stepType)) {
    throw createError({ statusCode: 400, message: `AI Import not supported for step ${body.stepType}` })
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { project: true },
  })
  if (!run) throw createError({ statusCode: 404, message: 'Pipeline run not found' })
  await requirePipelineManage(event, run.projectId)
  const scopeFilter = libraryScopeForProject(run.project)

  const [customPrompt, dbSystemPrompt, existingStep] = await Promise.all([
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({
          where: {
            id: body.systemPromptId,
            OR: [{ isSystem: true }, { isSystem: false, ...scopeFilter }],
          },
        })
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
  if (body.systemPromptId && !customPrompt) {
    throw createError({ statusCode: 403, message: 'Vybraný prompt není dostupný pro tento projekt.' })
  }

  const existingData = existingStep?.outputData ?? null

  // If the input is already valid JSON, skip the AI and merge directly.
  const preDetected = tryExtractValidJSON(body.rawInputText)
  if (preDetected !== null) {
    const itemCount = Array.isArray(preDetected) ? preDetected.length : 1
    console.log('[import-ai] input is already valid JSON — skipping AI, merging %d item(s) directly', itemCount)
    const mergedData = mergeOutputData(existingData, preDetected, body.stepType)
    const stepId = await saveStep(existingStep, runId, body, mergedData, user.id)
    await extractPIGlobalRecords(body, mergedData, user.id, runId, stepId)
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

  const runtimeConfig = useRuntimeConfig(event)
  const client = new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: runtimeConfig.openRouterApiKey as string,
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
      const apiKey = runtimeConfig.openRouterApiKey as string
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
      message: `AI returned invalid JSON (length=${rawOutput.length}, finish_reason=${finishReason}, error=${parseError?.slice(0, 120)})`,
    })
  }

  const mergedData = mergeOutputData(existingData, newData, body.stepType)
  const stepId = await saveStep(existingStep, runId, body, mergedData, user.id)
  await extractPIGlobalRecords(body, mergedData, user.id, runId, stepId)
  return { success: true, mergedData }
})

// Only PARTNER_IDENTIFICATION imports create GlobalRecord entries — competitions stay in step outputData only
async function extractPIGlobalRecords(
  body: ImportBody,
  mergedData: unknown,
  userId: string,
  pipelineRunId: string,
  stepId: string,
): Promise<void> {
  if (body.stepType !== 'PARTNER_IDENTIFICATION') return

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
  const candidates = [...byName.values()]
  if (candidates.length === 0) return

  try {
    const inputSource = await prisma.inputSource.create({
      data: {
        type: 'AI_IMPORT',
        pipelineRunId,
        stepId,
        label: `AI Import – ${new Date().toLocaleString('cs-CZ')}`,
        createdBy: userId,
        metadata: { config: { systemPromptId: body.systemPromptId ?? null } },
      },
    })
    for (const c of candidates) {
      await findOrCreateGlobalRecord(
        { name: c.name, url: c.url, type: 'PARTNER', payload: c.payload },
        userId, pipelineRunId, stepId, inputSource.id, 'IMPORTED'
      ).catch((err) => console.error('[import-ai] PI GlobalRecord link failed for "%s":', c.name, err))
    }
  } catch {
    // Non-fatal
  }
}
