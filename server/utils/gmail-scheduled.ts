import { listGmailDrafts, getGmailMessage } from '~/server/utils/google'

export interface GmailScheduledItem {
  id: string
  gmailId: string
  toAddress: string
  subject: string
}

function extractEmails(headerValue: string): string[] {
  return (headerValue.match(/[^\s<>,]+@[^\s<>,]+/g) ?? []).map(a => a.toLowerCase())
}

/**
 * Best-effort lookup of the current user's own Gmail "Scheduled" drafts addressed to
 * one of the partner's known e-mail addresses. Gmail's REST API does not expose the
 * actual scheduled send time for these (only accessible from within Gmail itself), so
 * these are surfaced as read-only, time-unknown entries — visibility that something is
 * queued, prepared directly in Gmail instead of through this app's composer.
 */
export async function getGmailScheduledForAddresses(
  accessToken: string,
  knownAddresses: Set<string>,
): Promise<GmailScheduledItem[]> {
  if (knownAddresses.size === 0) return []

  try {
    const drafts = await listGmailDrafts(accessToken, 'in:scheduled')
    if (drafts.length === 0) return []

    const items: GmailScheduledItem[] = []
    for (const draft of drafts) {
      try {
        const msg = await getGmailMessage(accessToken, draft.message.id, 'metadata')
        const headers = msg.payload.headers ?? []
        const to = headers.find(h => h.name.toLowerCase() === 'to')?.value ?? ''
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? ''
        const matched = extractEmails(to).some(a => knownAddresses.has(a))
        if (matched) {
          items.push({ id: `gmail:${draft.id}`, gmailId: draft.message.id, toAddress: to, subject })
        }
      } catch {
        // Skip drafts we fail to read individually
      }
    }
    return items
  } catch {
    return []
  }
}
