import { prisma } from '~/server/utils/prisma'
import { sendGmailMessage, refreshAccessToken, getGmailMessage } from '~/server/utils/google'
import { trackCustomRecipientAddress } from '~/server/utils/project-additional-addresses'
import { assignNegotiationOnSend } from '~/server/utils/negotiation-assignment'

interface SendPartnerEmailOptions {
  userId: string
  projectId: string
  globalRecordId: string
  toAddress: string
  cc?: string | null
  bcc?: string | null
  subject: string
  fullBody: string // already includes the signature, if any
  inReplyToGmailId?: string | null
}

/**
 * Sends an e-mail for a partner right now via the given user's Gmail account,
 * then records the resulting Email and negotiation assignment. Shared by
 * the immediate send-email endpoint and the scheduled-email poller so both
 * paths stay in sync.
 */
export async function sendPartnerEmailNow(opts: SendPartnerEmailOptions) {
  const { userId, projectId, globalRecordId, toAddress, cc, bcc, subject, fullBody, inReplyToGmailId } = opts

  const dbUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!dbUser?.accessToken) {
    throw new Error('Chybí Google přihlašovací token. Přihlaste se znovu.')
  }

  let accessToken = dbUser.accessToken
  if (dbUser.refreshToken && (!dbUser.tokenExpiry || dbUser.tokenExpiry < new Date())) {
    const config = useRuntimeConfig()
    const refreshed = await refreshAccessToken(dbUser.refreshToken, config.googleClientId, config.googleClientSecret)
    accessToken = refreshed.access_token
    await prisma.user.update({
      where: { id: userId },
      data: { accessToken: refreshed.access_token, tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
    })
  }

  let threading: { threadId: string; inReplyTo: string; references: string } | undefined

  if (inReplyToGmailId) {
    try {
      const origMsg = await getGmailMessage(accessToken, inReplyToGmailId, 'metadata')
      const rfcMessageId = (origMsg.payload.headers ?? []).find(h => h.name.toLowerCase() === 'message-id')?.value
      if (rfcMessageId && origMsg.threadId) {
        threading = { threadId: origMsg.threadId, inReplyTo: rfcMessageId, references: rfcMessageId }
      }
    } catch {
      // Threading info unavailable — send without thread linking
    }
  }

  const result = await sendGmailMessage(accessToken, toAddress, subject, fullBody, threading, cc ?? undefined, bcc ?? undefined)

  // The e-mail is now irreversibly sent — a hiccup in this bookkeeping must not
  // surface as a send failure (that would mark an already-delivered e-mail as
  // FAILED/retryable and risk a duplicate send). Only the To: recipients become
  // tracked project contacts — Cc/Bcc addresses are often internal/incidental,
  // not the partner's own contact, so they're intentionally left untouched
  // (though still recorded on the Email row itself for display purposes).
  //
  // toAddress may be in RFC 2822 display-name format: `"Name" <addr>` or `Name <addr>`
  // Extract just the bare email address before storing it.
  function extractEmail(raw: string): string {
    const match = raw.match(/[^<\s]+@[^>\s]+/)
    return match ? match[0].replace(/[<>]/g, '').trim() : raw.trim()
  }
  for (const addr of toAddress.split(',').map(a => extractEmail(a)).filter(Boolean)) {
    await trackCustomRecipientAddress(projectId, globalRecordId, addr)
      .catch(err => console.error('[send-partner-email] trackCustomRecipientAddress failed:', err))
  }
  const negotiation = await assignNegotiationOnSend(projectId, globalRecordId, userId)

  const email = await prisma.email.create({
    data: {
      negotiationId: negotiation.id,
      direction: 'SENT',
      subject,
      sentAt: new Date(),
      fromAddress: dbUser.email,
      toAddress,
      ccAddress: cc || null,
      bccAddress: bcc || null,
      gmailId: result.id,
      content: fullBody,
      createdBy: userId,
      isRead: true,
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      assignees: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  })

  return email
}
