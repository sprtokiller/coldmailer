import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { address, label, isPrimary } = await readBody(event)

  if (!address) throw createError({ statusCode: 400, statusMessage: 'address required' })

  if (isPrimary) {
    await prisma.partnerContact.updateMany({
      where: { globalRecordId },
      data: { isPrimary: false },
    })
  }

  return prisma.partnerContact.create({
    data: { globalRecordId, address, label: label || null, isPrimary: !!isPrimary },
  })
})
