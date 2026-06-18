import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  const record = await prisma.globalRecord.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
    },
  })

  if (!record) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const assigneeRows = projectId
    ? await prisma.interactionAssignee.findMany({
        where: { interaction: { globalRecordId: id, projectId } },
        select: { user: { select: { id: true, name: true, image: true } } },
        distinct: ['userId'],
      })
    : []

  return {
    ...record,
    assignees: assigneeRows.map(a => a.user),
  }
})
