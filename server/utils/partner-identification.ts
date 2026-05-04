import OpenAI from 'openai'
import { serpSearch } from './serpapi'
import { fetchPages } from './page-fetcher'
import { prisma } from './prisma'

const PIPELINE_MODEL = 'anthropic/claude-sonnet-4.6'
const DEDUP_MODEL    = 'anthropic/claude-3-5-haiku'

function createClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
    defaultHeaders: { 'HTTP-Referer': 'https://coldmailer.scg.cz', 'X-Title': 'SCG ColdMailer' },
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

function parseJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = match ? match[1] : text.trim()
  const jsonMatch = raw.match(/[{[][\s\S]*[}\]]/)
  return JSON.parse(jsonMatch ? jsonMatch[0] : raw)
}

export interface ItemProgress {
  index: number
  total: number
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  partnersFound?: number
  status: 'processing' | 'done' | 'error'
  error?: string
}

export type PartnerIdEvent =
  | { type: 'progress'; text: string }
  | { type: 'item'; item: ItemProgress }
  | { type: 'output'; data: unknown }

export interface PartnerIdOptions {
  inputData: Record<string, unknown>
  extractPrompt: string
  stepId: string
}

export async function* runPartnerIdentification(
  opts: PartnerIdOptions,
): AsyncGenerator<PartnerIdEvent> {
  const { inputData, extractPrompt, stepId } = opts
  const client = createClient()

  const found = findItemArray(inputData)
  if ('error' in found) { yield { type: 'progress', text: `❌ ${found.error}\n` }; return }
  const items = found.items
  if (items.length === 0) { yield { type: 'progress', text: '❌ Pole je prázdné.\n' }; return }

  yield { type: 'progress', text: `✓ Nalezeno ${items.length} položek. Spouštím pipeline…\n` }

  let existingPartners = await prisma.partner.findMany({ select: { id: true, name: true, website: true } })
  const allResults: unknown[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemName = String(item.name ?? item.title ?? item.url ?? `Položka ${i + 1}`)

    yield { type: 'progress', text: `\n── [${i + 1}/${items.length}] ${itemName}\n` }
    yield { type: 'item', item: { index: i + 1, total: items.length, itemName, status: 'processing' } }

    try {
      // a) Search term — constructed directly, no AI call needed
      const searchTerm = `${itemName} partneři`
      yield { type: 'progress', text: `  ✓ search term: "${searchTerm}"\n` }

      // b) SerpAPI
      yield { type: 'progress', text: `  ⟳ Hledám v Google…\n` }
      const serpResults = await serpSearch(searchTerm)
      yield { type: 'progress', text: `  ✓ ${serpResults.length} výsledků\n` }

      if (serpResults.length === 0) {
        allResults.push({ itemName, searchTerm, partners: [] })
        yield { type: 'item', item: { index: i + 1, total: items.length, itemName, searchTerm, serpResults: 0, status: 'done', partnersFound: 0 } }
        continue
      }

      // c-d) Fetch pages via Playwright
      yield { type: 'progress', text: `  ⟳ Načítám ${serpResults.length} stránek…\n` }
      const pages = await fetchPages(serpResults.map(r => r.url))
      const loadedPages = pages.filter(p => p.ok && p.text)
      yield { type: 'progress', text: `  ✓ Načteno ${loadedPages.length}/${pages.length}\n` }

      // e) Extract partners from each page
      const foundPartners: Array<{ name: string; website?: string; description?: string; type?: string }> = []
      for (const pg of loadedPages) {
        const ctx = [`URL: ${pg.url}`, `Title: ${pg.title}`, `Text:\n${pg.text.slice(0, 8_000)}`,
          pg.links.length ? `Links:\n${pg.links.slice(0, 50).map(l => `${l.text} → ${l.href}`).join('\n')}` : '',
          pg.alts.length ? `Alts: ${pg.alts.join(', ')}` : '',
        ].filter(Boolean).join('\n\n')
        try {
          const res = await client.chat.completions.create({
            model: PIPELINE_MODEL,
            messages: [
              { role: 'system', content: extractPrompt },
              { role: 'user', content: `Competition: ${itemName}\n\n${ctx}` },
            ],
            max_tokens: 1000,
          })
          const parsed = parseJson(res.choices[0]?.message?.content ?? '[]')
          const list = Array.isArray(parsed) ? parsed : ((parsed as { partners?: unknown[] })?.partners ?? [])
          foundPartners.push(...(list as typeof foundPartners).filter(p => p?.name))
        } catch {}
      }
      yield { type: 'progress', text: `  ✓ ${foundPartners.length} potenciálních partnerů\n` }

      // f-g) Dedup + save to DB
      let newCount = 0; let existingCount = 0
      const savedPartners: Array<{ partnerId: string; name: string; isNew: boolean }> = []
      // Per-item set: prevents the same partner being linked multiple times to the
      // same item when several scraped pages all mention that partner (e.g. APPLIFTING 3×).
      const linkedPartnerIds = new Set<string>()

      for (const fp of foundPartners) {
        if (!fp.name?.trim()) continue
        let partnerId: string; let isNew = true

        // 1. Fast exact match (name or website) — no AI needed
        const exact = existingPartners.find(ep =>
          ep.name.toLowerCase() === fp.name.toLowerCase() ||
          (fp.website && ep.website?.toLowerCase() === fp.website.toLowerCase()),
        )
        if (exact) {
          partnerId = exact.id; isNew = false
        } else {
          // 2. AI fuzzy dedup via cheap Haiku model
          try {
            const res = await client.chat.completions.create({
              model: DEDUP_MODEL,
              messages: [
                { role: 'system', content: 'Check if the new partner already exists in the list. Return JSON only: {"exists":false} or {"exists":true,"existingId":"<id>"}' },
                { role: 'user', content: `New: ${JSON.stringify(fp)}\n\nExisting: ${JSON.stringify(existingPartners.slice(0, 80))}` },
              ],
              max_tokens: 60,
            })
            const dedup = parseJson(res.choices[0]?.message?.content ?? '{"exists":false}') as { exists: boolean; existingId?: string }
            if (dedup.exists && dedup.existingId) { partnerId = dedup.existingId; isNew = false; }
            else throw new Error('new')
          } catch {
            const created = await prisma.partner.create({
              data: { name: fp.name, website: fp.website ?? null, description: fp.description ?? null, type: fp.type ?? null, rawData: fp as never },
            })
            partnerId = created.id
            existingPartners = [...existingPartners, { id: partnerId, name: fp.name, website: fp.website ?? null }]
          }
        }

        // Skip if this partner was already linked to this item in this pass
        // (same partner extracted from multiple pages of the same search).
        if (linkedPartnerIds.has(partnerId)) continue
        linkedPartnerIds.add(partnerId)

        await prisma.candidatePartner.create({
          data: { itemName, itemUrl: String(item.url ?? ''), partnerId, pipelineStepId: stepId },
        })
        if (isNew) newCount++; else existingCount++
        savedPartners.push({ partnerId, name: fp.name, isNew })
      }

      yield { type: 'progress', text: `  ✓ Uloženo: ${newCount} nových, ${existingCount} existujících\n` }
      allResults.push({ itemName, searchTerm, serpResults: serpResults.length, pagesLoaded: loadedPages.length, partners: savedPartners })
      yield { type: 'item', item: { index: i + 1, total: items.length, itemName, searchTerm, serpResults: serpResults.length, pagesLoaded: loadedPages.length, partnersFound: savedPartners.length, status: 'done' } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'progress', text: `  ❌ ${msg}\n` }
      yield { type: 'item', item: { index: i + 1, total: items.length, itemName, status: 'error', error: msg } }
      allResults.push({ itemName, error: msg })
    }
  }

  yield { type: 'progress', text: `\n✅ Hotovo! Zpracováno ${items.length} položek.\n` }
  yield { type: 'output', data: { items: allResults, totalItems: items.length } }
}
