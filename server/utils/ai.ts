import OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'

// Steps 1, 3, 4 use o4-mini-deep-research (live web search, minutes-long).
// Step 2 (PARTNER_IDENTIFICATION) runs its own pipeline (SerpAPI + Playwright + claude sonnet 4.6).
// Steps 5-7 use claude-sonnet-4.6 with adaptive reasoning (seconds).
const DEEP_RESEARCH_STEPS = new Set([
  'MARKET_SCANNING',
  'PARTNER_PROFILING',
  'CONTACT_DISCOVERY',
])

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
    defaultHeaders: {
      'HTTP-Referer': 'https://coldmailer.scg.cz',
      'X-Title': 'SCG ColdMailer',
    },
  })
}

export function modelForStep(stepType: string): string {
  return DEEP_RESEARCH_STEPS.has(stepType)
    ? 'openai/o4-mini-deep-research'
    : 'anthropic/claude-sonnet-4.6'
}

export interface StepAIInput {
  stepType: string
  systemPrompt: string
  contextParts: string[]
  userMessage: string
}

export async function* streamStepAI(input: StepAIInput): AsyncGenerator<string> {
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

  const stream = await client.chat.completions.create(
    params as Parameters<typeof client.chat.completions.create>[0],
  ) as AsyncIterable<ChatCompletionChunk>

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}
