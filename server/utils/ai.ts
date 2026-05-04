import OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import { OPENROUTER, MODELS, DEEP_RESEARCH_STEPS, STEP_MODEL } from '~/config/pipeline'

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
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
