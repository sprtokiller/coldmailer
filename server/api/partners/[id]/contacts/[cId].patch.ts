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
      ...(body.address !== undefined && { address: body.address }),
      ...(body.label !== undefined && { label: body.label || null }),
      ...(body.isPrimary !== undefined && { isPrimary: body.isPrimary }),
    },
  })
})
