import { chromium } from 'playwright'

export interface PageContent {
  url: string
  title: string
  text: string
  links: { href: string; text: string }[]
  alts: string[]
  ok: boolean
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox']

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function emptyPage(url: string): PageContent {
  return { url, title: '', text: '', links: [], alts: [], ok: false }
}

export function isSkippableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com'].some(h => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

async function fetchOneUrl(url: string): Promise<PageContent> {
  if (isSkippableUrl(url)) return emptyPage(url)

  const browser = await chromium.launch({ args: LAUNCH_ARGS }).catch(() => null)
  if (!browser) return emptyPage(url)

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT })
    try {
      const page = await context.newPage()
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await sleep(2_000)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)).catch(() => {})
        await sleep(500)

        const title = await page.title()
        const text = await page.evaluate<string>(() => document.body?.innerText ?? '')
        const links = await page.evaluate<{ href: string; text: string }[]>(() =>
          Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
            .slice(0, 100)
            .map(a => ({ href: a.href, text: (a.innerText ?? '').trim().slice(0, 120) }))
            .filter(l => l.href.startsWith('http')),
        )
        const alts = await page.evaluate<string[]>(() =>
          Array.from(document.images)
            .map(img => img.alt)
            .filter(Boolean)
            .slice(0, 50),
        )

        const trimmed = text.trim()
        const ok = response?.ok() !== false && (trimmed.length > 50 || alts.length > 0)
        return { url, title, text: trimmed.slice(0, 15_000), links, alts, ok }
      } catch {
        return emptyPage(url)
      } finally {
        await page.close().catch(() => {})
      }
    } finally {
      await context.close().catch(() => {})
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

export async function fetchPages(urls: string[]): Promise<PageContent[]> {
  if (urls.length === 0) return []

  const results: PageContent[] = []
  for (let i = 0; i < urls.length; i += 3) {
    const chunk = urls.slice(i, i + 3)
    const chunkResults = await Promise.all(chunk.map(url => fetchOneUrl(url)))
    results.push(...chunkResults)
  }
  return results
}

