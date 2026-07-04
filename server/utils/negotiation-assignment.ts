import { prisma } from '~/server/utils/prisma'

/**
 * Called right after an email is actually sent for a partner.
 * The sender becomes a NegotiationAssignee (jednání can have several people),
 * and negotiationStatus is bumped to CONTACTED only on first contact — it
 * never regresses a negotiation that has already progressed further.
 */
export async function assignNegotiationOnSend(projectId: string, globalRecordId: string, userId: string) {
  await prisma.negotiationAssignee.upsert({
    where: { projectId_globalRecordId_userId: { projectId, globalRecordId, userId } },
    create: { projectId, globalRecordId, userId, assignedById: userId },
    update: {},
  })

  await prisma.projectRecord.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, negotiationStatus: 'CONTACTED' },
    update: {},
  })
  await prisma.projectRecord.updateMany({
    where: { projectId, globalRecordId, negotiationStatus: null },
    data: { negotiationStatus: 'CONTACTED' },
  })
}
