import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const STALE_THRESHOLD_MS = 30 * 60 * 1000

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')!

  const runningStep = await prisma.pipelineStep.findFirst({
    where: { pipelineRunId: runId, status: 'RUNNING' },
    select: {
      id: true,
      stepType: true,
      createdAt: true,
      progress: true,
      runner: { select: { name: true, image: true } },
    },
  })

  if (!runningStep) return { runningStep: null }

  if (Date.now() - new Date(runningStep.createdAt).getTime() > STALE_THRESHOLD_MS) {
    await prisma.pipelineStep.update({
      where: { id: runningStep.id },
      data: {
        status: 'FAILED',
        errorMessage: 'Krok byl automaticky zrušen – překročen časový limit.',
        completedAt: new Date(),
        progress: Prisma.DbNull,
      },
    })
    return { runningStep: null }
  }

  return {
    runningStep: {
      id: runningStep.id,
      stepType: runningStep.stepType,
      runnerName: runningStep.runner.name,
      runnerImage: runningStep.runner.image,
      createdAt: runningStep.createdAt,
      progress: runningStep.progress,
    },
  }
})
