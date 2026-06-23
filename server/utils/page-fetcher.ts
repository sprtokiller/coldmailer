import { PlaywrightCrawler, Configuration } from 'crawlee'
import { MemoryStorage } from '@crawlee/memory-storage'

export interface PageContent {
  url: string
  title: string
  text: string
  links: { href: string; text: string }[]
  alts: string[]
  ok: boolean
}

export async function fetchPages(urls: string[]): Promise<PageContent[]> {
  if (urls.length === 0) return []

  const results: PageContent[] = []
  const config = new Configuration({ storageClient: new MemoryStorage({ persistStorage: false }) })

  const crawler = new PlaywrightCrawler(
    {
      maxConcurrency: 3,
      navigationTimeoutSecs: 30,
      requestHandlerTimeoutSecs: 60,
      browserPoolOptions: { useFingerprints: false },
      launchContext: {
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
      requestHandler: async ({ page, request }) => {
        try {
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

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
              .slice(0, 30),
          )

          results.push({ url: request.url, title, text: text.slice(0, 15_000), links, alts, ok: true })
        } catch {
          results.push({ url: request.url, title: '', text: '', links: [], alts: [], ok: false })
        }
      },
      failedRequestHandler: async ({ request }) => {
        results.push({ url: request.url, title: '', text: '', links: [], alts: [], ok: false })
      },
    },
    config,
  )

  await crawler.run(urls)
  return results
}
