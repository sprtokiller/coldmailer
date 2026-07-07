import { prisma } from '~/server/utils/prisma'

/**
 * Upserts NegotiationAssignee rows for each userId (jednání can have several
 * people, unlike the single-owner OutreachAssignment).
 */
export async function upsertNegotiationAssignees(
  projectId: string,
  globalRecordId: string,
  userIds: string[],
  assignedById: string,
) {
  if (userIds.length === 0) return
  await prisma.$transaction(
    userIds.map(userId => prisma.negotiationAssignee.upsert({
      where: { projectId_globalRecordId_userId: { projectId, globalRecordId, userId } },
      create: { projectId, globalRecordId, userId, assignedById },
      update: {},
    })),
  )
}

/**
 * Called right after an email is actually sent for a partner.
 * The sender becomes a NegotiationAssignee (jednání can have several people),
 * and negotiationStatus is bumped to CONTACTED only on first contact — it
 * never regresses a negotiation that has already progressed further.
 */
export async function assignNegotiationOnSend(projectId: string, globalRecordId: string, userId: string) {
  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, negotiationStatus: 'CONTACTED' },
    update: {},
  })
  await prisma.negotiation.updateMany({
    where: { projectId, globalRecordId, negotiationStatus: null },
    data: { negotiationStatus: 'CONTACTED' },
  })

  // The negotiation itself (needed as the Email's FK target) must exist even if
  // this assignee bookkeeping fails, so its failure is swallowed independently.
  await upsertNegotiationAssignees(projectId, globalRecordId, [userId], userId)
    .catch(err => console.error('[negotiation-assignment] negotiationAssignee upsert failed:', err))

  return negotiation
}
