import { prisma } from '~/server/utils/prisma'
import { getScheduledEmailListAccess } from '~/server/utils/scheduled-email-access'
import { refreshAccessToken } from '~/server/utils/google'
import { getGmailScheduledForAddresses, type GmailScheduledItem } from '~/server/utils/gmail-scheduled'

function mapGmailItem(item: GmailScheduledItem, user: { id: string; name: string; image: string | null }) {
  return {
    id: item.id,
    toAddress: item.toAddress,
    cc: null,
    bcc: null,
    subject: item.subject,
    body: '',
    scheduledFor: null,
    status: 'PENDING' as const,
    errorMessage: null,
    createdBy: { id: user.id, name: user.name, image: user.image },
    source: 'gmail' as const,
    gmailId: item.gmailId,
  }
}

export default defineEventHandler(async (event) => {
  const globalRecordId = getRouterParam(event, 'id')!
  const { session, projectId, canView } = await getScheduledEmailListAccess(event, globalRecordId)

  if (!projectId || !canView) return []

  const appScheduled = await prisma.scheduledEmail.findMany({
    where: { projectId, globalRecordId, status: { in: ['PENDING', 'SENDING', 'FAILED'] } },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
    orderBy: { scheduledFor: 'asc' },
  })

  // Best-effort: also surface e-mails the current user scheduled directly in Gmail
  // (Gmail's own "Schedule send"), bypassing this app's composer entirely.
  let gmailScheduled: ReturnType<typeof mapGmailItem>[] = []
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { accessToken: true, refreshToken: true, tokenExpiry: true },
    })
    if (dbUser?.accessToken) {
      let accessToken = dbUser.accessToken
      if (dbUser.refreshToken && (!dbUser.tokenExpiry || dbUser.tokenExpiry < new Date())) {
        const config = useRuntimeConfig()
        const refreshed = await refreshAccessToken(dbUser.refreshToken, config.googleClientId, config.googleClientSecret)
        accessToken = refreshed.access_token
        await prisma.user.update({
          where: { id: session.id },
          data: { accessToken: refreshed.access_token, tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
        })
      }

      const record = await prisma.globalRecord.findUnique({
        where: { id: globalRecordId },
        select: {
          contacts: { select: { address: true } },
          projectRecords: { where: { projectId }, select: { additionalAddresses: true } },
        },
      })
      const knownAddresses = new Set<string>()
      for (const c of record?.contacts ?? []) {
        if (c.address) knownAddresses.add(c.address.toLowerCase())
      }
      const additional = record?.projectRecords[0]?.additionalAddresses
      if (Array.isArray(additional)) {
        for (const a of additional) if (typeof a === 'string') knownAddresses.add(a.toLowerCase())
      }

      const found = await getGmailScheduledForAddresses(accessToken, knownAddresses)
      gmailScheduled = found.map(item => mapGmailItem(item, session))
    }
  } catch {
    // Gmail lookup is a nice-to-have — never let it break the scheduled-emails list
  }

  return [...appScheduled, ...gmailScheduled]
})
