import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const body = await readBody<{
    canonicalName?: string
    payload?: Record<string, unknown>
  }>(event)

  const existing = await prisma.globalRecord.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Partner nenalezen.' })
  if (existing.type !== 'PARTNER') throw createError({ statusCode: 400, statusMessage: 'Záznam není typu PARTNER.' })

  const nameUpdate: Record<string, string> = {}
  if (body.canonicalName?.trim()) {
    nameUpdate.canonicalName = body.canonicalName.trim()
    nameUpdate.normalizedName = normalizeName(nameUpdate.canonicalName)
  }

  const payloadUpdate = body.payload
    ? { payload: { ...(existing.payload as Record<string, unknown>), ...body.payload } }
    : {}

  try {
    const updated = await prisma.globalRecord.update({
      where: { id },
      data: { ...nameUpdate, ...payloadUpdate },
      select: { id: true, canonicalName: true, normalizedName: true, payload: true },
    })

    await logEvent({
      globalRecordId: id,
      userId: session.id,
      eventType: 'MANUAL_EDIT',
    })

    if (Array.isArray(body.payload?.contacts)) {
      const { syncProfileContactsToDb } = await import('~/server/utils/sync-contacts')
      await syncProfileContactsToDb(id, body.payload.contacts as any[])
    }

    return updated
  } catch (e: any) {
    if (e?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Partner s tímto názvem již existuje.' })
    }
    throw e
  }
})
