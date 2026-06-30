import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { Prisma } from '@prisma/client'

interface SelectionBody {
  // null = all items selected; array of item names = only those selected
  selectedNames: string[] | null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const stepId = getRouterParam(event, 'stepId')!
  const body = await readBody<SelectionBody>(event)

  const step = await prisma.pipelineStep.findUnique({
    where: { id: stepId },
    select: { stepType: true },
  })
  if (!step) throw createError({ statusCode: 404, message: 'Step not found' })
  if (step.stepType !== 'MARKET_SCANNING') {
    throw createError({ statusCode: 400, message: 'Selection endpoint is only for MARKET_SCANNING steps.' })
  }

  await prisma.pipelineStep.update({
    where: { id: stepId },
    data: {
      selectionData: body.selectedNames === null
        ? Prisma.DbNull
        : (body.selectedNames as Prisma.InputJsonValue),
    },
  })

  return { ok: true }
})
