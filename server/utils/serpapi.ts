export interface SerpResult {
  title: string
  url: string
  snippet: string
}

// ---------------------------------------------------------------------------
// Round-robin key rotation
// ---------------------------------------------------------------------------
// This counter lives at module scope, so it persists for the entire lifetime
// of the server process and is shared across all concurrent requests.
// ---------------------------------------------------------------------------
let _keyIndex = 0

/**
 * Returns the next SerpAPI key in round-robin order.
 * Reads the key list from Nuxt runtimeConfig (SERPAPI_KEYS env var).
 * Throws if no keys are configured.
 */
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

export async function serpSearch(query: string): Promise<SerpResult[]> {
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

  return (data.organic_results ?? [])
    .slice(0, 5)
    .map(r => ({ title: r.title ?? '', url: r.link ?? '', snippet: r.snippet ?? '' }))
    .filter(r => Boolean(r.url))
}
