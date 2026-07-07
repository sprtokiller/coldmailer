import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess, isAssignedToNegotiation } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const { session, access, email } = await requireEmailAccess(event, emailId, 'view')

  // Vedení obchodu / Admin čtou jménem kontroly, ne jako řešitelé — jejich čtení nesmí mail označit
  // za přečtený, POKUD nejsou zároveň sami oslovovatel/řešitel tohoto partnera.
  if (access.isAdmin || access.canEditAll) {
    const isAssigned = await isAssignedToNegotiation(session.id, email.projectId, email.globalRecordId)
    if (!isAssigned) {
      return { isRead: email.isRead }
    }
  }

  const updated = await prisma.email.update({
    where: { id: emailId },
    data: { isRead: true },
    select: { isRead: true },
  })

  return updated
})
