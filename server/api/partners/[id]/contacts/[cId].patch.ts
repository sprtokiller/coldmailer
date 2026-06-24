import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const cId = getRouterParam(event, 'cId')!
  const body = await readBody(event)

  if (body.isPrimary) {
    await prisma.partnerContact.updateMany({
      where: { globalRecordId },
      data: { isPrimary: false },
    })
  }

  return prisma.partnerContact.update({
    where: { id: cId },
    data: {
      ...(body.address !== undefined && { address: body.address.trim().toLowerCase() }),
      ...(body.label !== undefined && { label: body.label || null }),
      ...(body.firstName !== undefined && { firstName: body.firstName || null }),
      ...(body.lastName !== undefined && { lastName: body.lastName || null }),
      ...(body.role !== undefined && { role: body.role || null }),
      ...(body.contactType !== undefined && { contactType: body.contactType || null }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.note !== undefined && { note: body.note || null }),
      ...(body.isPrimary !== undefined && { isPrimary: body.isPrimary }),
    },
  })
})
