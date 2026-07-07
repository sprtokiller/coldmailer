import { prisma } from '~/server/utils/prisma'
import { syncGmailForNegotiationRecord } from '~/server/utils/gmail-sync'

const ASSIGNMENT_SYNC_LOOKBACK_DAYS = 90

/**
 * Upserts NegotiationAssignee rows for each userId (jednání can have several
 * people, unlike the single-owner OutreachAssignment). The first assignee ever
 * added promotes negotiationStatus to V_JEDNANI, unless it has already
 * progressed further (never regresses an advanced status).
 *
 * Each userId that is newly added (not already an assignee) gets a background
 * 90-day Gmail backfill for this partner, so history predating the assignment
 * (e.g. an email sent before the partner existed in the DB) still shows up.
 */
export async function upsertNegotiationAssignees(
  projectId: string,
  globalRecordId: string,
  userIds: string[],
  assignedById: string,
) {
  if (userIds.length === 0) return

  const existing = await prisma.negotiationAssignee.findMany({
    where: { projectId, globalRecordId, userId: { in: userIds } },
    select: { userId: true },
  })
  const existingIds = new Set(existing.map(e => e.userId))
  const newUserIds = userIds.filter(id => !existingIds.has(id))

  await prisma.$transaction(
    userIds.map(userId => prisma.negotiationAssignee.upsert({
      where: { projectId_globalRecordId_userId: { projectId, globalRecordId, userId } },
      create: { projectId, globalRecordId, userId, assignedById },
      update: {},
    })),
  )
  await prisma.negotiation.updateMany({
    where: { projectId, globalRecordId, OR: [{ negotiationStatus: null }, { negotiationStatus: 'PRED_OSLOVENIM' }] },
    data: { negotiationStatus: 'V_JEDNANI' },
  })

  for (const userId of newUserIds) {
    syncGmailForNegotiationRecord(userId, projectId, globalRecordId, ASSIGNMENT_SYNC_LOOKBACK_DAYS)
      .catch(err => console.warn('[gmail-sync] Assignment backfill failed:', err.message ?? err))
  }
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
    where: { projectId, globalRecordId, OR: [{ negotiationStatus: null }, { negotiationStatus: { in: ['PRED_OSLOVENIM', 'V_JEDNANI'] } }] },
    data: { negotiationStatus: 'CONTACTED' },
  })

  // The negotiation itself (needed as the Email's FK target) must exist even if
  // this assignee bookkeeping fails, so its failure is swallowed independently.
  await upsertNegotiationAssignees(projectId, globalRecordId, [userId], userId)
    .catch(err => console.error('[negotiation-assignment] negotiationAssignee upsert failed:', err))

  return negotiation
}
