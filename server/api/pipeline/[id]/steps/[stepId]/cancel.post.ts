import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { cancelJob } from '~/server/utils/job-registry'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const stepId = getRouterParam(event, 'stepId')!

  const step = await prisma.pipelineStep.findFirst({
    where: { id: stepId, pipelineRunId: runId, status: 'RUNNING' },
  })

  if (!step) {
    throw createError({ statusCode: 404, message: 'Krok nebyl nalezen nebo již neběží.' })
  }

  cancelJob(stepId)

  await prisma.pipelineStep.update({
    where: { id: stepId },
    data: {
      status: 'FAILED',
      errorMessage: 'Zrušeno uživatelem',
      completedAt: new Date(),
      progress: Prisma.DbNull,
    },
  })

  return { ok: true }
})
