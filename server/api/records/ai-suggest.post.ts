import OpenAI from 'openai'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { OPENROUTER, MODELS } from '~/config/pipeline'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { stepId, query, type } = await readBody<{ stepId: string; query: string; type?: string }>(event)
  if (!query?.trim()) return []

  const existing = await prisma.pipelineRecordRef.findMany({
    where: { stepId },
    select: { globalRecordId: true },
  })
  const excludeIds = existing.map(r => r.globalRecordId)

  const candidates = await prisma.globalRecord.findMany({
    where: {
      ...(type ? { type: type as 'COMPETITION' | 'PARTNER' } : {}),
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { id: true, canonicalName: true, type: true },
  })
  if (!candidates.length) return []

  const config = useRuntimeConfig(event)
  const client = new OpenAI({ baseURL: OPENROUTER.baseURL, apiKey: config.openRouterApiKey as string })
  const list = candidates.map((c, i) => `${i}: ${c.canonicalName}`).join('\n')
  let indices: number[] = []
  try {
    const res = await client.chat.completions.create({
      model: MODELS.CLAUDE_HAIKU,
      messages: [
        {
          role: 'system',
          content: 'Given a search query and a numbered list of records, return a JSON array of the most relevant record indices (max 20), ordered by relevance. Reply with only the JSON array, no other text.',
        },
        { role: 'user', content: `Query: "${query}"\n\nRecords:\n${list}` },
      ],
    })
    const text = res.choices[0]?.message?.content?.trim() ?? ''
    const match = text.match(/\[[\s\d,]+\]/)
    if (match) indices = JSON.parse(match[0])
  } catch {}

  return indices
    .filter((i): i is number => typeof i === 'number' && i >= 0 && i < candidates.length)
    .slice(0, 20)
    .map(i => candidates[i])
})
