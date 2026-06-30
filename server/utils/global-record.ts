import { prisma } from '~/server/utils/prisma'
import { logEvent } from '~/server/utils/record-events'

export async function updateRelevanceStatus(
  recordId: string,
  status: string,
  userId: string,
): Promise<void> {
  const record = await prisma.globalRecord.findUnique({ where: { id: recordId } })
  if (!record) return
  const payload = { ...(record.payload as Record<string, unknown>), relevanceStatus: status }
  await prisma.globalRecord.update({
    where: { id: recordId },
    data: { payload: payload as never },
  })
  await logEvent({ globalRecordId: recordId, userId, eventType: 'STATUS_CHANGED', metadata: { status } })
}


