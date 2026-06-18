import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  await requireInteractionAccess(event, iId, 'edit')

  await prisma.interaction.delete({ where: { id: iId } })
  return { ok: true }
})
