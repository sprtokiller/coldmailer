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
      metadata: (params.metadata ?? {}) as never,
    },
  })
}

export async function logDeleteEvent(params: {
  globalRecordId: string
  userId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await logEvent({ ...params, eventType: 'DELETED' })
}

export async function logMergeEvent(params: {
  globalRecordId: string
  mergedIntoId: string
  userId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await logEvent({
    globalRecordId: params.globalRecordId,
    userId: params.userId,
    eventType: 'MERGED',
    metadata: { mergedIntoId: params.mergedIntoId, ...(params.metadata ?? {}) },
  })
}

export async function getEventHistory(globalRecordId: string) {
  return prisma.recordEvent.findMany({
    where: { globalRecordId },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { timestamp: 'desc' },
  })
}

