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
      contacts: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
      negotiationAssignees: {
        where: projectId ? { projectId } : undefined,
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      outreachAssignments: {
        where: projectId ? { projectId } : undefined,
        include: { assignee: { select: { id: true, name: true, image: true } } },
      },
      negotiations: {
        where: projectId ? { projectId } : undefined,
        select: { negotiationStatus: true },
      },
    },
  })

  if (!record) throw createError({ statusCode: 404, message: 'Not found' })

  const negotiation = record.negotiations[0] ?? null
  const assignees = record.negotiationAssignees.map(a => a.user)
  const outreachAssignment = record.outreachAssignments[0]?.assignee ?? null
  const { negotiations: _, negotiationAssignees: __, outreachAssignments: ___, ...rest } = record

  return {
    ...rest,
    negotiationStatus: negotiation?.negotiationStatus ?? null,
    assignees,
    outreachAssignment,
  }
})
