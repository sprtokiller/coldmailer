import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { projectId } = getQuery(event) as { projectId?: string }

  let groupId: string | undefined
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { groupId: true } })
    groupId = project?.groupId
  }

  const [templates, personal] = await Promise.all([
    prisma.signature.findMany({
      where: { isTemplate: true, ...(groupId ? { groupId } : {}) },
      include: { author: { select: { id: true, name: true, image: true } }, group: { select: { id: true, name: true, color: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.signature.findMany({
      where: { isTemplate: false, authorId: user.id, ...(groupId ? { groupId } : {}) },
      include: { group: { select: { id: true, name: true, color: true } } },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    }),
  ])

  return { templates, personal }
})
