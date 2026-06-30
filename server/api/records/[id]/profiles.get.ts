import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

type ProfileData = Record<string, unknown>

function asProfileData(value: unknown): ProfileData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ProfileData
}

function hasProfileData(data: ProfileData): boolean {
  return Boolean(
    data.industry
    || data.summary
    || data.profile
    || (Array.isArray(data.contacts) && data.contacts.length > 0),
  )
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const record = await prisma.globalRecord.findUnique({
    where: { id },
    select: { id: true, canonicalName: true, payload: true, updatedAt: true },
  })

  if (!record) throw createError({ statusCode: 404, message: 'GlobalRecord not found' })

  const currentPayload = asProfileData(record.payload)
  const current = currentPayload && hasProfileData(currentPayload)
    ? {
        data: { ...currentPayload, partnerId: currentPayload.partnerId ?? record.id, name: currentPayload.name ?? record.canonicalName },
        updatedAt: record.updatedAt.toISOString(),
      }
    : null

  return { current, historical: [] }
})
