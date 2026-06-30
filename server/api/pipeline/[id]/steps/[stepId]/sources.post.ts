import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const stepId = getRouterParam(event, 'stepId')!
  const { label, type, metadata } = await readBody<{
    label: string
    type: string
    metadata?: Record<string, unknown>
  }>(event)

  const step = await prisma.pipelineStep.findUnique({ where: { id: stepId } })
  if (!step) throw createError({ statusCode: 404, message: 'Step not found' })

  return prisma.inputSource.create({
    data: {
      type: type as never,
      pipelineRunId: runId,
      stepId,
      label,
      createdBy: user.id,
      metadata: metadata ?? {},
    },
  })
})
