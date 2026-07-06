import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat toto jednání. Nejste přiřazeni k tomuto partnerovi.' })
  }

  const body = await readBody<{ myToThem?: string | null; themToUs?: string | null }>(event)
  const data: Record<string, any> = {}
  if (body.myToThem !== undefined) data.myToThem = body.myToThem
  if (body.themToUs !== undefined) data.themToUs = body.themToUs

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, ...data },
    update: data,
  })

  // Track co-authorship, same as toggle-check
  const isAlreadyAssignee = await prisma.fulfillmentAssignee.findUnique({
    where: { negotiationId_userId: { negotiationId: negotiation.id, userId: session.id } },
  })
  if (!isAlreadyAssignee) {
    await prisma.fulfillmentAssignee.create({
      data: { negotiationId: negotiation.id, userId: session.id },
    }).catch(() => {})
  }

  return { id: negotiation.id, myToThem: negotiation.myToThem, themToUs: negotiation.themToUs }
})
