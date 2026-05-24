import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { normalizeName } from '~/server/utils/deduplication'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { canonicalName, payload: payloadPatch } = await readBody<{
    canonicalName?: string
    payload?: Record<string, unknown>
  }>(event)

  const existing = await prisma.globalRecord.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404 })

  const nameUpdate = canonicalName?.trim()
    ? { canonicalName: canonicalName.trim(), normalizedName: normalizeName(canonicalName.trim()) }
    : {}

  const payloadUpdate = payloadPatch
    ? { payload: { ...(existing.payload as Record<string, unknown>), ...payloadPatch } }
    : {}

  return prisma.globalRecord.update({
    where: { id },
    data: { ...nameUpdate, ...payloadUpdate },
    select: { id: true, canonicalName: true, normalizedName: true, payload: true },
  })
})
