import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { startTrackedPartnerEmailSyncs } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const body = await readBody<{
    address: string
    label?: string
    firstName?: string
    lastName?: string
    role?: string
    contactType?: string
    priority?: number
    note?: string
    isPrimary?: boolean
  }>(event)

  if (!body.address) throw createError({ statusCode: 400, message: 'address required' })

  const address = body.address.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(address)) {
    throw createError({ statusCode: 400, message: 'invalid email format' })
  }

  if (body.isPrimary) {
    await prisma.partnerContact.updateMany({
      where: { globalRecordId },
      data: { isPrimary: false },
    })
  }

  const contact = await prisma.partnerContact.upsert({
    where: { globalRecordId_address: { globalRecordId, address } },
    create: {
      globalRecordId,
      address,
      label: body.label || null,
      firstName: body.firstName || null,
      lastName: body.lastName || null,
      role: body.role || null,
      contactType: body.contactType || null,
      priority: body.priority ?? 3,
      note: body.note || null,
      isPrimary: !!body.isPrimary,
    },
    update: {
      label: body.label || undefined,
      firstName: body.firstName || undefined,
      lastName: body.lastName || undefined,
      role: body.role || undefined,
      contactType: body.contactType || undefined,
      priority: body.priority ?? undefined,
      note: body.note || undefined,
      isPrimary: body.isPrimary ?? undefined,
    },
  })

  startTrackedPartnerEmailSyncs(session.id, globalRecordId, [address])

  return contact
})
