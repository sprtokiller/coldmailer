import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { cancelJob } from '~/server/utils/job-registry'

const STALE_THRESHOLD_MS = 30 * 60 * 1000

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')!

  const runningSteps = await prisma.pipelineStep.findMany({
    where: { pipelineRunId: runId, status: 'RUNNING' },
    select: {
      id: true,
      stepType: true,
      createdAt: true,
      progress: true,
      runner: { select: { name: true, image: true } },
    },
  })

  const liveSteps = []
  for (const step of runningSteps) {
    if (Date.now() - new Date(step.createdAt).getTime() > STALE_THRESHOLD_MS) {
      cancelJob(step.id)
      await prisma.pipelineStep.update({
        where: { id: step.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Krok byl automaticky zrušen – překročen časový limit.',
          completedAt: new Date(),
          progress: Prisma.DbNull,
        },
      })
    } else {
      liveSteps.push({
        id: step.id,
        stepType: step.stepType,
        runnerName: step.runner.name,
        runnerImage: step.runner.image,
        createdAt: step.createdAt,
        progress: step.progress,
      })
    }
  }

  return { runningSteps: liveSteps }
})
