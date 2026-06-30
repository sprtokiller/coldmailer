import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getProjectPermissions } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, image: true } },
      project: { include: { group: true } },
      steps: {
        include: {
          systemPrompt: true,
          sellingPoint: true,
          runner: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!run) throw createError({ statusCode: 404, message: 'Pipeline run not found' })

  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { isAdmin: true } })
  const userPermissions = user?.isAdmin ? [] : await getProjectPermissions(session.id, run.projectId)

  return { ...run, userPermissions, userIsAdmin: user?.isAdmin ?? false }
})
