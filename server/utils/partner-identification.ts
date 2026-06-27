import OpenAI from 'openai'
import { serpSearch, type SerpResult } from './serpapi'
import { fetchPages, isSkippableUrl } from './page-fetcher'
import { prisma } from './prisma'
import { findOrCreateGlobalRecord } from '~/server/utils/global-record'
import { OPENROUTER, MODELS } from '~/config/pipeline'

const PIPELINE_MODEL = MODELS.CLAUDE_SONNET

function createClient() {
  const config = useRuntimeConfig()
  return new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: config.openRouterApiKey as string,
    defaultHeaders: { 'HTTP-Referer': OPENROUTER.siteUrl, 'X-Title': OPENROUTER.siteTitle },
  })
}

export function findItemArray(
  data: unknown,
): { items: Record<string, unknown>[] } | { error: string } {
  if (Array.isArray(data)) return { items: data as Record<string, unknown>[] }
  if (data && typeof data === 'object') {
    const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray) as unknown[][]
    if (arrays.length === 0) return { error: 'Vstupní JSON neobsahuje žádné pole.' }
    if (arrays.length > 1) return { error: `Vstupní JSON obsahuje ${arrays.length} pole – musí být právě jedno.` }
    return { items: arrays[0] as Record<string, unknown>[] }
  }
  return { error: 'Vstupní data nejsou JSON objekt ani pole.' }
}

async function fetchGenerationCost(generationId: string): Promise<number> {
  const apiKey = useRuntimeConfig().openRouterApiKey as string
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000))
    try {
      const res = await fetch(
        `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
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

function parseJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = match ? match[1] : text.trim()
  const jsonMatch = raw.match(/[{[][\s\S]*[}\]]/)
  return JSON.parse(jsonMatch ? jsonMatch[0] : raw)
}

function prioritizeSerpResults(results: SerpResult[]): SerpResult[] {
  const score = (r: SerpResult) => {
    let s = 0
    if (/partner|sponzor/i.test(r.url)) s += 10
    if (/partner|sponzor/i.test(r.title)) s += 5
    if (/partner|sponzor/i.test(r.snippet)) s += 2
    if (/instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com/i.test(r.url)) s -= 8
    return s
  }
  return [...results].sort((a, b) => score(b) - score(a))
}

function buildExtractionContext(serp: SerpResult, page?: { url: string; title: string; text: string; links: { href: string; text: string }[]; alts: string[]; ok: boolean }): string | null {
  const parts: string[] = [`Competition context from search:`, `URL: ${serp.url}`, `Title: ${serp.title}`]
  if (serp.snippet) parts.push(`Google snippet:\n${serp.snippet}`)

  if (page?.ok && page.text.trim()) {
    parts.push(
      `Page title: ${page.title}`,
      `Page text:\n${page.text.slice(0, 8_000)}`,
      page.links.length ? `Links:\n${page.links.slice(0, 50).map(l => `${l.text} → ${l.href}`).join('\n')}` : '',
      page.alts.length ? `Image alts: ${page.alts.join(', ')}` : '',
    )
  } else if (!serp.snippet?.trim()) {
    return null
  } else {
    parts.push('(Stránku se nepodařilo načíst – použij Google snippet a název výsledku.)')
  }

  return parts.filter(Boolean).join('\n\n')
}

type SerpPageStatus = 'loaded' | 'snippet' | 'unavailable' | 'skipped'

interface SerpPageInfo {
  url: string
  title: string
  status: SerpPageStatus
}

function classifySerpPage(serp: SerpResult, page?: { ok: boolean; text: string }): SerpPageInfo {
  if (isSkippableUrl(serp.url)) {
    return { url: serp.url, title: serp.title, status: 'skipped' }
  }
  if (page?.ok && page.text.trim()) {
    return { url: serp.url, title: serp.title, status: 'loaded' }
  }
  if (serp.snippet?.trim()) {
    return { url: serp.url, title: serp.title, status: 'snippet' }
  }
  return { url: serp.url, title: serp.title, status: 'unavailable' }
}

const PAGE_STATUS_LABELS: Record<SerpPageStatus, string> = {
  loaded: '✓ načteno',
  snippet: '⚠ nedostupná → snippet z Google',
  unavailable: '✗ nedostupná',
  skipped: '⊘ přeskočeno (sociální síť)',
}

function formatSerpPagesProgress(pages: SerpPageInfo[]): string {
  if (pages.length === 0) return ''
  return `  📋 Nalezené stránky:\n${pages.map(p => `    ${PAGE_STATUS_LABELS[p.status]}  ${p.url}`).join('\n')}\n`
}

export interface ItemProgress {
  index: number
  total: number
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  pages?: SerpPageInfo[]
  partnersFound?: number
  status: 'processing' | 'done' | 'error'
  error?: string
}

export type PartnerIdEvent =
  | { type: 'progress'; text: string }
  | { type: 'item'; item: ItemProgress }
  | { type: 'output'; data: unknown; totalCostUsd: number }

export interface PartnerIdOptions {
  inputData: Record<string, unknown>
  extractPrompt: string
  stepId: string
  pipelineRunId: string
  userId: string
  signal?: AbortSignal
}

export async function* runPartnerIdentification(
  opts: PartnerIdOptions,
): AsyncGenerator<PartnerIdEvent> {
  const { inputData, extractPrompt, stepId, pipelineRunId, userId, signal } = opts
  const client = createClient()

  const found = findItemArray(inputData)
  if ('error' in found) { yield { type: 'progress', text: `❌ ${found.error}\n` }; return }
  const items = found.items
  if (items.length === 0) { yield { type: 'progress', text: '❌ Pole je prázdné.\n' }; return }

  yield { type: 'progress', text: `✓ Nalezeno ${items.length} položek. Spouštím pipeline…\n` }

  const inputSource = await prisma.inputSource.create({
    data: {
      type: 'MINI_DEEP_RESEARCH',
      pipelineRunId,
      stepId,
      label: `Partner Identification – ${new Date().toLocaleString('cs-CZ')}`,
      createdBy: userId,
    },
  })
  const allResults: unknown[] = []
  let totalCostUsd = 0

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) {
      yield { type: 'progress', text: '\n⛔ Krok byl zrušen.\n' }
      return
    }
    const item = items[i]
    const itemName = String(item.name ?? item.title ?? item.url ?? `Položka ${i + 1}`)

    yield { type: 'progress', text: `\n── [${i + 1}/${items.length}] ${itemName}\n` }
    yield { type: 'item', item: { index: i + 1, total: items.length, itemName, status: 'processing' } }

    try {
      // a) Search term — constructed directly, no AI call needed
      const searchTerm = `${itemName} partneři`
      yield { type: 'progress', text: `  ✓ search term: "${searchTerm}"\n` }

      // b) SerpAPI
      yield { type: 'progress', text: `  ⧳ Hledám v Google…\n` }
      const serpResults = prioritizeSerpResults(await serpSearch(searchTerm, {
        userId,
        pipelineStepId: stepId,
        stepType: 'PARTNER_IDENTIFICATION',
      }))
      yield { type: 'progress', text: `  ✓ ${serpResults.length} výsledků\n` }
      yield {
        type: 'progress',
        text: serpResults.map((r, n) => `    ${n + 1}. ${r.title}\n       ${r.url}`).join('\n') + '\n',
      }

      if (serpResults.length === 0) {
        allResults.push({ itemName, searchTerm, partners: [] })
        yield { type: 'item', item: { index: i + 1, total: items.length, itemName, searchTerm, serpResults: 0, status: 'done', partnersFound: 0 } }
        continue
      }

      // c-d) Fetch pages via Playwright (fallback to SerpAPI snippet when unreachable)
      yield { type: 'progress', text: `  ⟳ Načítám ${serpResults.length} stránek…\n` }
      let pages: Awaited<ReturnType<typeof fetchPages>> = []
      try {
        pages = await fetchPages(serpResults.map(r => r.url))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        yield { type: 'progress', text: `  ⚠ Načítání stránek selhalo (${msg}) – pokračuji se snippety z Google\n` }
        pages = serpResults.map(r => ({ url: r.url, title: '', text: '', links: [], alts: [], ok: false }))
      }
      const pageByUrl = new Map(pages.map(p => [p.url, p]))
      const pageStatuses = serpResults.map(serp => classifySerpPage(serp, pageByUrl.get(serp.url)))
      const pagesLoaded = pageStatuses.filter(p => p.status === 'loaded').length
      const snippetFallbacks = pageStatuses.filter(p => p.status === 'snippet').length
      const unavailable = pageStatuses.filter(p => p.status === 'unavailable').length

      yield { type: 'progress', text: formatSerpPagesProgress(pageStatuses) }
      yield {
        type: 'progress',
        text: `  ✓ Načteno ${pagesLoaded}/${serpResults.length}${snippetFallbacks ? `, ${snippetFallbacks}× snippet` : ''}${unavailable ? `, ${unavailable}× nedostupné` : ''}\n`,
      }
      yield {
        type: 'item',
        item: {
          index: i + 1,
          total: items.length,
          itemName,
          searchTerm,
          serpResults: serpResults.length,
          pagesLoaded,
          pages: pageStatuses,
          status: 'processing',
        },
      }

      // e) Extract partners from each result (page content or SerpAPI snippet)
      const foundPartners: Array<{ name: string; website?: string; description?: string; type?: string }> = []
      for (const serp of serpResults) {
        const pg = pageByUrl.get(serp.url)
        const ctx = buildExtractionContext(serp, pg)
        if (!ctx) continue

        try {
          const res = await client.chat.completions.create({
            model: PIPELINE_MODEL,
            messages: [
              { role: 'system', content: extractPrompt },
              { role: 'user', content: `Competition: ${itemName}\n\n${ctx}` },
            ],
            max_tokens: 1000,
          })
          if (res.id) totalCostUsd += await fetchGenerationCost(res.id)
          const parsed = parseJson(res.choices[0]?.message?.content ?? '[]')
          const list = Array.isArray(parsed) ? parsed : ((parsed as { partners?: unknown[] })?.partners ?? [])
          foundPartners.push(...(list as typeof foundPartners).filter(p => p?.name))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          yield { type: 'progress', text: `  ⚠ Extrakce z ${serp.url} selhala: ${msg}\n` }
        }
      }
      yield { type: 'progress', text: `  ✓ ${foundPartners.length} potenciálních partnerů\n` }

      // f-g) Dedup + save to GlobalRecord
      let newCount = 0; let existingCount = 0
      const savedPartners: Array<{ partnerId: string; name: string; isNew: boolean }> = []
      const linkedIds = new Set<string>()

      for (const fp of foundPartners) {
        if (!fp.name?.trim()) continue
        try {
          const { globalRecordId, wasCreated } = await findOrCreateGlobalRecord(
            {
              name: fp.name,
              url: fp.website ?? undefined,
              type: 'PARTNER',
              payload: { name: fp.name, website: fp.website ?? null, description: fp.description ?? null, type: fp.type ?? null },
            },
            userId, pipelineRunId, stepId, inputSource.id, 'GENERATED'
          )
          if (linkedIds.has(globalRecordId)) continue
          linkedIds.add(globalRecordId)
          if (wasCreated) newCount++; else existingCount++
          savedPartners.push({ partnerId: globalRecordId, name: fp.name, isNew: wasCreated })
        } catch {}
      }

      yield { type: 'progress', text: `  ✓ Uloženo: ${newCount} nových, ${existingCount} existujících\n` }
      allResults.push({ itemName, searchTerm, serpResults: serpResults.length, pagesLoaded, pages: pageStatuses, partners: savedPartners })
      yield {
        type: 'item',
        item: {
          index: i + 1,
          total: items.length,
          itemName,
          searchTerm,
          serpResults: serpResults.length,
          pagesLoaded,
          pages: pageStatuses,
          partnersFound: savedPartners.length,
          status: 'done',
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'progress', text: `  ❌ ${msg}\n` }
      yield { type: 'item', item: { index: i + 1, total: items.length, itemName, status: 'error', error: msg } }
      allResults.push({ itemName, error: msg })
    }
  }

  yield { type: 'progress', text: `\n✅ Hotovo! Zpracováno ${items.length} položek.\n` }
  yield { type: 'output', data: { items: allResults, totalItems: items.length }, totalCostUsd }
}
