import OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import { OPENROUTER, MODELS, DEEP_RESEARCH_STEPS, STEP_MODEL } from '~/config/pipeline'

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

export function modelForStep(stepType: string): string {
  return STEP_MODEL[stepType] ?? MODELS.CLAUDE_SONNET
}

export { DEEP_RESEARCH_STEPS }

export interface StepAIInput {
  stepType: string
  systemPrompt: string
  contextParts: string[]
  userMessage: string
}

export interface StreamStepAIResult {
  stream: AsyncGenerator<string>
  getCost: () => Promise<number>
}

export function streamStepAI(input: StepAIInput, timeoutMs = 8 * 60 * 1000): StreamStepAIResult {
  const client = createClient()
  const model = modelForStep(input.stepType)

  const contextBlock = input.contextParts.length
    ? `\n\n<context>\n${input.contextParts.join('\n\n')}\n</context>`
    : ''

  const params = {
    model,
    stream: true as const,
    messages: [
      { role: 'system' as const, content: input.systemPrompt + contextBlock },
      { role: 'user' as const, content: input.userMessage },
    ],
    // Enable adaptive reasoning for Claude Sonnet 4.6.
    // OpenRouter forwards provider-specific keys; not in OpenAI spec so cast needed.
    ...(model.startsWith('anthropic/')
      ? ({ reasoning: { enabled: true, effort: 'high' } } as object)
      : {}),
  }

  let capturedGenerationId: string | null = null

  const abortController = new AbortController()
  const timeoutHandle = setTimeout(
    () => abortController.abort(new Error(`AI stream timed out after ${timeoutMs / 1000}s`)),
    timeoutMs,
  )

  async function* generator(): AsyncGenerator<string> {
    try {
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
