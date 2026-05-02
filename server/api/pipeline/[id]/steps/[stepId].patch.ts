import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const stepId = getRouterParam(event, 'stepId')!
  const body = await readBody<{ outputData: unknown }>(event)

  const step = await prisma.pipelineStep.findUnique({ where: { id: stepId } })
  if (!step) throw createError({ statusCode: 404, statusMessage: 'Step not found' })

  return prisma.pipelineStep.update({
    where: { id: stepId },
    data: { outputData: body.outputData as never },
  })
})
