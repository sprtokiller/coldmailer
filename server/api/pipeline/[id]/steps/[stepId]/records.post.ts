import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const stepId = getRouterParam(event, 'stepId')!
  const { globalRecordId } = await readBody<{ globalRecordId: string }>(event)

  const [step, record] = await Promise.all([
    prisma.pipelineStep.findUnique({ where: { id: stepId } }),
    prisma.globalRecord.findUnique({ where: { id: globalRecordId } }),
  ])
  if (!step) throw createError({ statusCode: 404, statusMessage: 'Step not found' })
  if (!record) throw createError({ statusCode: 404, statusMessage: 'GlobalRecord not found' })

  return prisma.pipelineRecordRef.upsert({
    where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId: runId, stepId, globalRecordId } },
    create: { pipelineRunId: runId, stepId, globalRecordId, addedBy: user.id, addMethod: 'GLOBAL_DB' },
    update: { isSelectedForProcessing: true },
  })
})
