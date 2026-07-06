import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.isAdmin && !access.canEditAll) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění odebrat partnera z projektu.' })
  }

  // Nemažeme Negotiation řádek (e-maily, poznámky, plnění, adresy) — Email/Note
  // na něj mají FK s onDelete: Cascade, takže smazání by nenávratně smazalo
  // celou historii. Místo toho ho jen označíme jako odebraný (removedAt), aby
  // zmizel z Jednání i Oslovování; historie se obnoví při opětovném přidání partnera.
  await prisma.outreachAssignment.deleteMany({ where: { projectId, globalRecordId } })
  await prisma.negotiation.updateMany({
    where: { projectId, globalRecordId },
    data: { removedAt: new Date() },
  })

  return { success: true }
})
