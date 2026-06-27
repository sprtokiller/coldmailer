import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const { globalRecordId } = await readBody<{ globalRecordId: string }>(event)

  const record = await prisma.globalRecord.findUnique({ where: { id: globalRecordId } })
  if (!record) throw createError({ statusCode: 404, statusMessage: 'GlobalRecord not found' })

  // Find or create the PI step for this run
  let piStep = await prisma.pipelineStep.findFirst({
    where: { pipelineRunId: runId, stepType: 'PARTNER_IDENTIFICATION' },
    orderBy: { createdAt: 'desc' },
  })
  if (!piStep) {
    piStep = await prisma.pipelineStep.create({
      data: {
        pipelineRunId: runId,
        stepType: 'PARTNER_IDENTIFICATION',
        status: 'COMPLETED',
        contextPartIds: [],
        inputData: {},
        outputData: { items: [] },
        runnerId: user.id,
        completedAt: new Date(),
      },
    })
  }

  // Reuse or create a shared InputSource for manual imports on this step
  let inputSource = await prisma.inputSource.findFirst({
    where: { stepId: piStep.id, type: 'AI_IMPORT', label: 'Ruční import' },
  })
  if (!inputSource) {
    inputSource = await prisma.inputSource.create({
      data: {
        type: 'AI_IMPORT',
        pipelineRunId: runId,
        stepId: piStep.id,
        label: 'Ruční import',
        createdBy: user.id,
      },
    })
  }

  // Link as IMPORTED; upgrade from GLOBAL_DB if a lower-priority ref already exists
  const existing = await prisma.pipelineRecordRef.findUnique({
    where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId: runId, stepId: piStep.id, globalRecordId } },
    select: { addMethod: true },
  })

  if (!existing) {
    await prisma.pipelineRecordRef.create({
      data: {
        pipelineRunId: runId,
        stepId: piStep.id,
        globalRecordId,
        inputSourceId: inputSource.id,
        addedBy: user.id,
        addMethod: 'IMPORTED',
        isSelectedForProcessing: true,
      },
    })
  } else if (existing.addMethod === 'GLOBAL_DB') {
    await prisma.pipelineRecordRef.update({
      where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId: runId, stepId: piStep.id, globalRecordId } },
      data: { addMethod: 'IMPORTED', inputSourceId: inputSource.id, isSelectedForProcessing: true },
    })
  }

  return { stepId: piStep.id }
})
