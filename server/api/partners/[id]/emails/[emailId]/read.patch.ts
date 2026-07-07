import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const { access, email } = await requireEmailAccess(event, emailId, 'view')

  // Vedení obchodu / Admin čtou jménem kontroly, ne jako řešitelé — jejich čtení nesmí mail označit za přečtený.
  if (access.isAdmin || access.canEditAll) {
    return { isRead: email.isRead }
  }

  const updated = await prisma.email.update({
    where: { id: emailId },
    data: { isRead: true },
    select: { isRead: true },
  })

  return updated
})
