import OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import { OPENROUTER, MODELS, REASONING_STEP_TYPES, DEFAULT_REASONING_EFFORT, type ReasoningEffort, type ReasoningStepType } from '~/config/pipeline'
import { prisma } from '~/server/utils/prisma'

const REASONING_EFFORT_CONFIG_KEY = 'ai.reasoningEffort'

async function getReasoningEffort(stepType: string): Promise<ReasoningEffort> {
  if (!(REASONING_STEP_TYPES as readonly string[]).includes(stepType)) return 'auto'
  const row = await prisma.systemConfig.findUnique({ where: { key: REASONING_EFFORT_CONFIG_KEY } })
  const overrides = (row?.value as Partial<Record<ReasoningStepType, ReasoningEffort>>) ?? {}
  return overrides[stepType as ReasoningStepType] ?? DEFAULT_REASONING_EFFORT[stepType as ReasoningStepType]
}

function createClient(): OpenAI {
  const config = useRuntimeConfig()
  return new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: config.openRouterApiKey as string,
    defaultHeaders: {
      'HTTP-Referer': OPENROUTER.siteUrl,
      'X-Title':      OPENROUTER.siteTitle,
    },
  })
}

export interface StepAIInput {
  stepType: string
  systemPrompt: string
  userMessage: string
}

export interface StreamStepAIResult {
  stream: AsyncGenerator<string>
  getCost: () => Promise<number>
}

export function streamStepAI(input: StepAIInput, timeoutMs = 8 * 60 * 1000, externalSignal?: AbortSignal): StreamStepAIResult {
  const client = createClient()
  const model = MODELS.CLAUDE_SONNET

  let capturedGenerationId: string | null = null

  const abortController = new AbortController()
  const timeoutHandle = setTimeout(
    () => abortController.abort(new Error(`AI stream timed out after ${timeoutMs / 1000}s`)),
    timeoutMs,
  )

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', () => abortController.abort(externalSignal.reason), { once: true })
    }
  }

  async function* generator(): AsyncGenerator<string> {
    try {
      const effort = await getReasoningEffort(input.stepType)
      const params = {
        model,
        stream: true as const,
        messages: [
          { role: 'system' as const, content: input.systemPrompt },
          { role: 'user' as const, content: input.userMessage },
        ],
        // OpenRouter forwards provider-specific keys; not in OpenAI spec so cast needed.
        // effort 'auto' omits the field entirely, letting the model's own default
        // (adaptive thinking on Claude Sonnet 5) apply instead of forcing a level.
        ...(model.startsWith('anthropic/') && effort !== 'auto'
          ? ({ reasoning: { enabled: true, effort } } as object)
          : {}),
      }

      const stream = await client.chat.completions.create(
        { ...params, signal: abortController.signal } as Parameters<typeof client.chat.completions.create>[0],
      ) as AsyncIterable<ChatCompletionChunk>

      for await (const chunk of stream) {
        // Capture generation ID from first chunk (top-level id field)
        if (!capturedGenerationId && chunk.id) {
          capturedGenerationId = chunk.id
        }
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield delta
      }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  async function getCost(): Promise<number> {
    if (!capturedGenerationId) return 0
    const apiKey = useRuntimeConfig().openRouterApiKey as string
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000))
      try {
        const res = await fetch(
          `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(capturedGenerationId)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
        )
        if (!res.ok) continue
        const json = await res.json() as { data?: { total_cost?: number } }
        const cost = json.data?.total_cost ?? 0
        if (cost > 0) return cost
      } catch { /* retry */ }
    }
    return 0
  }

  return { stream: generator(), getCost }
}

