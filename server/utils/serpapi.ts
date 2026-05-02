export interface SerpResult {
  title: string
  url: string
  snippet: string
}

export async function serpSearch(query: string): Promise<SerpResult[]> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) throw new Error('SERPAPI_KEY is not set in environment variables')

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
