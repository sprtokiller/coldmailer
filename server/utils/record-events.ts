import { prisma } from '~/server/utils/prisma'

interface LogEventParams {
  globalRecordId: string
  pipelineRunId?: string
  stepId?: string
  userId: string
  eventType: string
  metadata?: Record<string, unknown>
}

export async function logEvent(params: LogEventParams): Promise<void> {
  await prisma.recordEvent.create({
    data: {
      globalRecordId: params.globalRecordId,
      pipelineRunId: params.pipelineRunId,
      stepId: params.stepId,
      userId: params.userId,
      eventType: params.eventType,
      metadata: params.metadata ?? {},
    },
  })
}

export async function getEventHistory(globalRecordId: string) {
  return prisma.recordEvent.findMany({
    where: { globalRecordId },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { timestamp: 'desc' },
  })
}
