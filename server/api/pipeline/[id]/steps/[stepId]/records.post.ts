import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const HIGH_PRIORITY = new Set(['GENERATED', 'IMPORTED'])

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

  // Enforce priority: skip if a higher-priority source already holds this record
  const existing = await prisma.pipelineRecordRef.findUnique({
    where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId: runId, stepId, globalRecordId } },
    select: { addMethod: true },
  })
  if (existing) {
    if (HIGH_PRIORITY.has(existing.addMethod)) {
      return { skipped: true, existingSource: existing.addMethod }
    }
    // Already a GLOBAL_DB ref — ensure it's selected
    return prisma.pipelineRecordRef.update({
      where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId: runId, stepId, globalRecordId } },
      data: { isSelectedForProcessing: true },
    })
  }

  let inputSource = await prisma.inputSource.findFirst({
    where: { stepId, type: 'GLOBAL_DB_SELECT' },
  })
  if (!inputSource) {
    inputSource = await prisma.inputSource.create({
      data: {
        type: 'GLOBAL_DB_SELECT',
        pipelineRunId: runId,
        stepId,
        label: 'Ručně vybrané',
        createdBy: user.id,
      },
    })
  }

  return prisma.pipelineRecordRef.create({
    data: { pipelineRunId: runId, stepId, globalRecordId, addedBy: user.id, addMethod: 'GLOBAL_DB', inputSourceId: inputSource.id, isSelectedForProcessing: true },
  })
})
