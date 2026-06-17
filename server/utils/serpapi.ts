import { trackSerpUsage } from '~/server/utils/usage-tracker'

export interface SerpResult {
  title: string
  url: string
  snippet: string
}

// ---------------------------------------------------------------------------
// Round-robin key rotation
// ---------------------------------------------------------------------------
let _keyIndex = 0

function getNextApiKey(): string {
  const config = useRuntimeConfig()
  const keys: string[] = Array.isArray(config.serpApiKeys) ? config.serpApiKeys : []

  if (keys.length === 0) {
    throw new Error('No SerpAPI keys configured. Set SERPAPI_KEYS in your .env file (comma-separated).')
  }

  const key = keys[_keyIndex % keys.length]
  _keyIndex = (_keyIndex + 1) % keys.length
  return key
}

// ---------------------------------------------------------------------------
// Search function
// ---------------------------------------------------------------------------

export interface SerpSearchContext {
  userId?: string
  pipelineStepId?: string
  stepType?: string
}

export async function serpSearch(
  query: string,
  ctx: SerpSearchContext = {},
): Promise<SerpResult[]> {
  const apiKey = getNextApiKey()

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    hl: 'cs',
    gl: 'cz',
    num: '5',
    engine: 'google',
  })

  const res = await fetch(`https://serpapi.com/search?${params}`)
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`)

  const data = await res.json() as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>
  }

  // Track usage asynchronously — never blocks the search result
  if (ctx.userId) {
    trackSerpUsage({
      userId:         ctx.userId,
      pipelineStepId: ctx.pipelineStepId,
      stepType:       ctx.stepType,
    }).catch(() => {})
  }

  return (data.organic_results ?? [])
    .slice(0, 5)
    .map(r => ({ title: r.title ?? '', url: r.link ?? '', snippet: r.snippet ?? '' }))
    .filter(r => Boolean(r.url))
}
