import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { projectId, signatureId } = getQuery(event) as { projectId?: string; signatureId?: string }

  let groupId: string | undefined
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { groupId: true } })
    groupId = project?.groupId
  }

  const [templates, personal, external] = await Promise.all([
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
    // A specific other user's signature (e.g. saved on a draft by its original
    // author) — fetched by id regardless of ownership, so a viewer can see
    // whose signature is currently on the draft even though it's not theirs.
    signatureId
      ? prisma.signature.findFirst({
          where: { id: signatureId, authorId: { not: user.id } },
          include: { author: { select: { id: true, name: true } } },
        })
      : null,
  ])

  return { templates, personal, external }
})
