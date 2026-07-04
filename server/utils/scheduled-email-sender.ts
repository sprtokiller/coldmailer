import { prisma } from '~/server/utils/prisma'
import { sendPartnerEmailNow } from '~/server/utils/send-partner-email'

/**
 * Attempts to send one due ScheduledEmail. Atomically claims it (PENDING/FAILED -> SENDING)
 * first so an overlapping poll tick or a concurrent "send now"/"retry" click can't send it
 * twice. FAILED is claimable too, so a user can retry after e.g. reconnecting Google — the
 * poller itself only ever looks for PENDING rows, so it never auto-retries a failure.
 * Returns true if this call performed the send (successfully or not).
 */
export async function trySendScheduledEmail(scheduledEmailId: string): Promise<boolean> {
  const claimed = await prisma.scheduledEmail.updateMany({
    where: { id: scheduledEmailId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'SENDING' },
  })
  if (claimed.count === 0) return false

  const email = await prisma.scheduledEmail.findUnique({ where: { id: scheduledEmailId } })
  if (!email) return false

  try {
    const result = await sendPartnerEmailNow({
      userId: email.createdById,
      projectId: email.projectId,
      globalRecordId: email.globalRecordId,
      toAddress: email.toAddress,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      fullBody: email.body,
      inReplyToGmailId: email.inReplyToGmailId,
    })
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'SENT', sentAt: new Date(), gmailId: result.gmailId },
    })
  } catch (err) {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) },
    })
  }
  return true
}
