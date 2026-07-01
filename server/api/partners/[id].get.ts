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
      contacts: { orderBy: [{ isPrimary: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }] },
      outreachAssignments: {
        where: projectId ? { projectId } : undefined,
        include: { assignee: { select: { id: true, name: true, image: true } } },
      },
      projectRecords: {
        where: projectId ? { projectId } : undefined,
        select: { dealStage: true, actionStatus: true },
      },
    },
  })

  if (!record) throw createError({ statusCode: 404, message: 'Not found' })

  const projectRecord = record.projectRecords[0] ?? null
  const assignees = record.outreachAssignments.map(a => a.assignee)

  return {
    ...record,
    actionStatus: projectRecord?.actionStatus ?? null,
    dealStage: projectRecord?.dealStage ?? null,
    assignees,
  }
})
