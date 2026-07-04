import { prisma } from '~/server/utils/prisma'
import { sendPartnerEmailNow } from '~/server/utils/send-partner-email'
import { startWork } from '~/server/utils/work-registry'

/**
 * Attempts to send one due ScheduledEmail. Atomically claims it (PENDING/FAILED -> SENDING)
 * first so an overlapping poll tick or a concurrent "send now"/"retry" click can't send it
 * twice. FAILED is claimable too, so a user can retry after e.g. reconnecting Google — the
 * poller itself only ever looks for PENDING rows, so it never auto-retries a failure.
 * Returns true if this call performed the send (successfully or not).
 *
 * The whole attempt is tracked in the work registry. The work entry is registered BEFORE
 * the claim, so the poller's orphaned-SENDING recovery (which treats any SENDING row
 * without a matching running work entry as a leftover from a crash) can never race a
 * legitimately in-flight send.
 */
export async function trySendScheduledEmail(scheduledEmailId: string): Promise<boolean> {
  const email = await prisma.scheduledEmail.findUnique({ where: { id: scheduledEmailId } })
  if (!email) return false

  const handle = startWork({
    kind: 'SCHEDULED_EMAIL',
    label: `Plánovaný e-mail na ${email.toAddress}`,
    userId: email.createdById,
    projectId: email.projectId,
    globalRecordId: email.globalRecordId,
    refId: email.id,
  })

  const claimed = await prisma.scheduledEmail.updateMany({
    where: { id: scheduledEmailId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'SENDING' },
  })
  if (claimed.count === 0) {
    // Someone else already claimed it — nothing happened, don't clutter history.
    handle.discard()
    return false
  }

  try {
    handle.setProgress(0, null, 'Odesílá se…')
    const result = await sendPartnerEmailNow({
      userId: email.createdById,
      projectId: email.projectId,
      globalRecordId: email.globalRecordId,
      toAddress: email.toAddress,
      subject: email.subject,
      fullBody: email.body,
      inReplyToGmailId: email.inReplyToGmailId,
    })
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'SENT', sentAt: new Date(), gmailId: result.gmailId },
    })
    handle.complete('Odesláno')
  } catch (err) {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) },
    })
    handle.fail(err)
  }
  return true
}
