import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const { session, email, access } = await requireEmailAccess(event, emailId, 'view')

  if (email.createdBy !== session.id && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Smazat smí pouze autor nebo administrátor.' })
  }

  await prisma.email.delete({ where: { id: emailId } })
  return { ok: true }
})
