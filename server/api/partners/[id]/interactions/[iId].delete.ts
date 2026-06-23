import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  const { session, interaction, access } = await requireInteractionAccess(event, iId, 'view')

  if (interaction.createdBy !== session.id && !access.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Smazat smí pouze autor nebo administrátor.' })
  }

  await prisma.interaction.delete({ where: { id: iId } })
  return { ok: true }
})
