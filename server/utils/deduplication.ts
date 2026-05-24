import { prisma } from '~/server/utils/prisma'
import type { RecordType } from '@prisma/client'

// ── Jaro-Winkler ─────────────────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  let matches = 0
  let transpositions = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const j = jaro(s1, s2)
  let prefix = 0
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return j + prefix * p * (1 - j)
}

// ── Name normalisation ────────────────────────────────────────────────────────

const LEGAL_SUFFIXES = /\b(s\.r\.o\.|a\.s\.|spol\.|k\.s\.|v\.o\.s\.|LLC|Ltd|GmbH|Inc|Corp|S\.A\.|N\.V\.)\b/gi
const CZECH_COMPETITION_SUFFIXES = /\b(olympiáda|soutěž|liga|challenge|hackathon|cup|championship)\b/gi
const PARENTHETICALS = /\([^)]*\)/g

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(PARENTHETICALS, '')
    .replace(LEGAL_SUFFIXES, '')
    .replace(CZECH_COMPETITION_SUFFIXES, '')
    .replace(/[,;.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeduplicationResult {
  matchStatus: 'exact_match' | 'probable_match' | 'possible_match' | 'unique'
  confidence: number
  matchedRecordId?: string
  explanation: string
  recommendedAction: 'link' | 'review' | 'create'
}

interface DeduplicationCandidate {
  name: string
  url?: string
  type: RecordType
}

// ── LLM adjudication (Tier 3) ─────────────────────────────────────────────────

async function llmAdjudicate(
  candidate: DeduplicationCandidate,
  existingRecords: Array<{ id: string; canonicalName: string; payload: unknown }>
): Promise<{ matchedId: string | null; confidence: number; explanation: string }> {
  const config = useRuntimeConfig()
  const openai = new (await import('openai')).default({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: config.openRouterApiKey as string,
  })

  const top3 = existingRecords.slice(0, 3).map(r => ({
    id: r.id,
    name: r.canonicalName,
    snippet: JSON.stringify(r.payload).slice(0, 200),
  }))

  const response = await openai.chat.completions.create({
    model: 'anthropic/claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Do the following refer to the same real-world entity?

Candidate: "${candidate.name}"${candidate.url ? ` (${candidate.url})` : ''}

Existing records:
${top3.map((r, i) => `${i + 1}. "${r.name}" — ${r.snippet}`).join('\n')}

Reply with JSON only: { "matchIndex": 1|2|3|null, "confidence": 0.0-1.0, "explanation": "..." }
matchIndex is the 1-based index of the best match, or null if none match.`,
      },
    ],
  })

  try {
    const text = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    const matchIdx = parsed.matchIndex ? Number(parsed.matchIndex) - 1 : -1
    const matched = matchIdx >= 0 && matchIdx < top3.length ? top3[matchIdx] : null
    return {
      matchedId: matched?.id ?? null,
      confidence: Number(parsed.confidence) || 0,
      explanation: String(parsed.explanation || ''),
    }
  } catch {
    return { matchedId: null, confidence: 0, explanation: 'LLM adjudication failed' }
  }
}

// ── Main deduplication check ───────────────────────────────────────────────────

export async function checkDuplicate(candidate: DeduplicationCandidate): Promise<DeduplicationResult> {
  const normalizedCandidate = normalizeName(candidate.name)
  const candidateDomain = candidate.url ? extractDomain(candidate.url) : null

  // Tier 1: exact match on normalized name
  const exactByName = await prisma.globalRecord.findFirst({
    where: { type: candidate.type, normalizedName: normalizedCandidate },
    select: { id: true, canonicalName: true },
  })
  if (exactByName) {
    return {
      matchStatus: 'exact_match',
      confidence: 1,
      matchedRecordId: exactByName.id,
      explanation: `Exact normalized name match: "${exactByName.canonicalName}"`,
      recommendedAction: 'link',
    }
  }

  // Tier 1b: domain match
  if (candidateDomain) {
    const allOfType = await prisma.globalRecord.findMany({
      where: { type: candidate.type },
      select: { id: true, canonicalName: true, payload: true },
      take: 500,
    })
    for (const rec of allOfType) {
      const payload = rec.payload as Record<string, unknown>
      const recUrl = (payload.url ?? payload.website ?? '') as string
      const recDomain = extractDomain(recUrl)
      if (recDomain && recDomain === candidateDomain) {
        return {
          matchStatus: 'exact_match',
          confidence: 1,
          matchedRecordId: rec.id,
          explanation: `Exact domain match: ${candidateDomain}`,
          recommendedAction: 'link',
        }
      }
    }
  }

  // Tier 2: Jaro-Winkler fuzzy match
  const allOfType = await prisma.globalRecord.findMany({
    where: { type: candidate.type },
    select: { id: true, canonicalName: true, normalizedName: true, payload: true },
    take: 500,
  })

  if (allOfType.length === 0) {
    return { matchStatus: 'unique', confidence: 0, explanation: 'No existing records of this type', recommendedAction: 'create' }
  }

  let bestScore = 0
  let bestRecord: typeof allOfType[0] | null = null
  for (const rec of allOfType) {
    const score = jaroWinkler(normalizedCandidate, rec.normalizedName)
    if (score > bestScore) { bestScore = score; bestRecord = rec }
  }

  if (bestScore >= 0.92) {
    return {
      matchStatus: 'probable_match',
      confidence: bestScore,
      matchedRecordId: bestRecord!.id,
      explanation: `High fuzzy similarity (${(bestScore * 100).toFixed(0)}%) with "${bestRecord!.canonicalName}"`,
      recommendedAction: 'link',
    }
  }

  if (bestScore >= 0.70) {
    // Tier 3: LLM adjudication
    const topCandidates = allOfType
      .map(r => ({ ...r, score: jaroWinkler(normalizedCandidate, r.normalizedName) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    try {
      const llm = await llmAdjudicate(candidate, topCandidates)
      if (llm.matchedId && llm.confidence >= 0.85) {
        return {
          matchStatus: 'probable_match',
          confidence: llm.confidence,
          matchedRecordId: llm.matchedId,
          explanation: `LLM adjudication: ${llm.explanation}`,
          recommendedAction: 'link',
        }
      }
      if (llm.matchedId && llm.confidence >= 0.60) {
        return {
          matchStatus: 'possible_match',
          confidence: llm.confidence,
          matchedRecordId: llm.matchedId,
          explanation: `LLM: uncertain match — ${llm.explanation}`,
          recommendedAction: 'review',
        }
      }
    } catch {
      // fallthrough to unique on LLM error
    }
  }

  return {
    matchStatus: 'unique',
    confidence: bestScore,
    explanation: bestScore >= 0.70
      ? `Best fuzzy match "${bestRecord?.canonicalName}" (${(bestScore * 100).toFixed(0)}%) — LLM ruled out`
      : `No close match found (best similarity: ${(bestScore * 100).toFixed(0)}%)`,
    recommendedAction: 'create',
  }
}
