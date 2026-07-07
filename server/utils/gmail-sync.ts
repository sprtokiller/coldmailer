import { prisma } from '~/server/utils/prisma'
import {
  refreshAccessToken,
  listGmailMessages,
  getGmailMessage,
  type GmailMessage,
  type GmailMessagePart,
} from '~/server/utils/google'
import { appendProjectAdditionalAddress } from '~/server/utils/project-additional-addresses'

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 200

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'seznam.cz', 'email.cz', 'post.cz',
  'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.co.uk',
  'centrum.cz', 'atlas.cz', 'volny.cz', 'tiscali.cz',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com',
  'proton.me', 'mail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'gmx.de',
])

export function getDomainFromEmail(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

type PartnerDomainContext = {
  domains: Set<string>
  knownEmails: Set<string>
  blacklistedEmails: Set<string>
  projectId: string
  autoIncludeDomain: boolean
}

async function buildDomainContext(
  globalRecordIds: string[],
): Promise<Map<string, PartnerDomainContext>> {
  if (globalRecordIds.length === 0) return new Map()

  const records = await prisma.globalRecord.findMany({
    where: { id: { in: globalRecordIds } },
    select: {
      id: true,
      payload: true,
      contacts: { select: { address: true } },
      negotiations: {
        select: {
          blacklistedAddresses: { select: { address: true } },
          additionalAddresses: { select: { address: true } },
          autoIncludeDomain: true,
        },
      },
    },
  })

  const result = new Map<string, PartnerDomainContext>()

  for (const rec of records) {
    const domains = new Set<string>()
    const knownEmails = new Set<string>()
    const blacklistedEmails = new Set<string>()

    for (const c of rec.contacts) {
      if (!c.address) continue
      const addr = c.address.toLowerCase()
      knownEmails.add(addr)
      const domain = getDomainFromEmail(addr)
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        domains.add(domain)
      }
    }

    const payload = rec.payload as Record<string, unknown> | null
    const website = String(payload?.website ?? payload?.url ?? '')
    if (website) {
      const domain = getDomainFromUrl(website)
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        domains.add(domain)
      }
    }

    for (const neg of rec.negotiations) {
      for (const b of neg.blacklistedAddresses) {
        blacklistedEmails.add(b.address.toLowerCase())
      }
      // Include project-specific addresses as known so they don't get auto-promoted to global contacts
      for (const a of neg.additionalAddresses) {
        knownEmails.add(a.address.toLowerCase())
      }
    }

    const hasCompanyDomain = domains.size > 0
    // null stored value → default to true when a company domain exists (backward-compat)
    const autoIncludeDomain = rec.negotiations.some(
      neg => neg.autoIncludeDomain === true || (neg.autoIncludeDomain === null && hasCompanyDomain),
    ) || (rec.negotiations.length === 0 && hasCompanyDomain)

    result.set(rec.id, { domains, knownEmails, blacklistedEmails, projectId: '', autoIncludeDomain })
  }

  return result
}

export async function syncGmailForUser(userId: string, options?: { forceLookbackDays?: number }): Promise<{ synced: number; assigned: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
      lastGmailSync: true,
      createdAt: true,
      isAdmin: true,
    },
  })

  if (!user?.accessToken) return { synced: 0, assigned: false }

  const accessToken = await ensureFreshToken(user)

  const historyDays = await getEmailSyncHistoryDays()
  const afterDate = options?.forceLookbackDays
    ? (() => { const d = new Date(); d.setDate(d.getDate() - options.forceLookbackDays!); return d })()
    : computeSyncStart(user.lastGmailSync, user.createdAt, historyDays)
  const partnerEmailMap = await collectPartnerEmails(user.id, user.isAdmin)

  if (partnerEmailMap.size === 0) {
    return { synced: 0, assigned: false }
  }

  const allRecordIds = [...new Set([...partnerEmailMap.values()].flat().map(e => e.globalRecordId))]
  const domainCtx = await buildDomainContext(allRecordIds)
  for (const [, entries] of partnerEmailMap) {
    for (const entry of entries) {
      const ctx = domainCtx.get(entry.globalRecordId)
      if (ctx) ctx.projectId = entry.projectId
    }
  }

  const afterTimestamp = Math.floor(afterDate.getTime() / 1000)
  const query = `after:${afterTimestamp} -in:draft`

  let synced = 0
  let pageToken: string | undefined
  const allNewEmails: NewEmailRecord[] = []

  do {
    const listing = await listGmailMessages(accessToken, query, pageToken)
    const messageIds = listing.messages ?? []
    pageToken = listing.nextPageToken

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(m => getGmailMessage(accessToken, m.id).catch(() => null)),
      )

      for (const msg of results) {
        if (!msg) continue
        const result = await processMessage(msg, user.id, user.email, partnerEmailMap, domainCtx)
        synced += result.created
        allNewEmails.push(...result.newEmails)
      }

      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  } while (pageToken)

  await normalizeUnreadAfterSync(allNewEmails)
  await prisma.user.update({ where: { id: userId }, data: { lastGmailSync: new Date() } })
  return { synced, assigned: true }
}

async function ensureFreshToken(user: {
  id: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: Date | null
}): Promise<string> {
  if (!user.accessToken) throw new Error('No access token')

  if (user.tokenExpiry && user.tokenExpiry < new Date() && user.refreshToken) {
    const config = useRuntimeConfig()
    const refreshed = await refreshAccessToken(
      user.refreshToken,
      config.googleClientId,
      config.googleClientSecret,
    )
    await prisma.user.update({
      where: { id: user.id },
      data: {
        accessToken: refreshed.access_token,
        tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    })
    return refreshed.access_token
  }

  return user.accessToken
}

export async function syncGmailForAllUsers(): Promise<{ totalSynced: number; perUser: { userId: string; synced: number; error?: string }[] }> {
  const users = await prisma.user.findMany({
    where: { accessToken: { not: null }, googleId: { not: 'system' } },
    select: { id: true },
  })

  const perUser: { userId: string; synced: number; error?: string }[] = []
  let totalSynced = 0

  for (const u of users) {
    try {
      const result = await syncGmailForUser(u.id)
      perUser.push({ userId: u.id, synced: result.synced })
      totalSynced += result.synced
    } catch (err: any) {
      perUser.push({ userId: u.id, synced: 0, error: err?.message ?? String(err) })
    }
  }

  return { totalSynced, perUser }
}

export async function getEmailSyncHistoryDays(): Promise<number> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'email.syncHistoryDays' } })
  return typeof row?.value === 'number' ? (row.value as number) : 30
}

function computeSyncStart(lastSync: Date | null, createdAt: Date, historyDays: number): Date {
  if (lastSync) return lastSync

  const lookback = new Date(createdAt)
  lookback.setDate(lookback.getDate() - historyDays)

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  return lookback < oneYearAgo ? oneYearAgo : lookback
}

export async function syncGmailForPartnerEmail(
  userId: string,
  globalRecordId: string,
  emailAddress: string,
  lookbackDays: number,
  knownProjectId?: string,
): Promise<{ synced: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
    },
  })

  if (!user?.accessToken) return { synced: 0 }

  const accessToken = await ensureFreshToken(user)

  let projectId = knownProjectId
  if (!projectId) {
    const record = await prisma.globalRecord.findUnique({
      where: { id: globalRecordId },
      select: {
        negotiations: { take: 1, select: { projectId: true } },
      },
    })
    projectId = record?.negotiations[0]?.projectId
  }

  if (!projectId) return { synced: 0 }

  const normalizedEmail = emailAddress.toLowerCase()
  const partnerEmailMap = new Map<string, PartnerEmailEntry[]>()
  partnerEmailMap.set(normalizedEmail, [{ globalRecordId, projectId }])

  const domainCtx = await buildDomainContext([globalRecordId])
  const ctx = domainCtx.get(globalRecordId)
  if (ctx) ctx.projectId = projectId

  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const afterDate = lookbackDate < oneYearAgo ? oneYearAgo : lookbackDate

  const afterTimestamp = Math.floor(afterDate.getTime() / 1000)
  const query = `(from:${normalizedEmail} OR to:${normalizedEmail}) after:${afterTimestamp} -in:draft`

  let synced = 0
  let pageToken: string | undefined
  const allNewEmails: NewEmailRecord[] = []

  do {
    const listing = await listGmailMessages(accessToken, query, pageToken)
    const messageIds = listing.messages ?? []
    pageToken = listing.nextPageToken

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(m => getGmailMessage(accessToken, m.id).catch(() => null)),
      )

      for (const msg of results) {
        if (!msg) continue
        const result = await processMessage(msg, userId, user.email, partnerEmailMap, domainCtx)
        synced += result.created
        allNewEmails.push(...result.newEmails)
      }

      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  } while (pageToken)

  await normalizeUnreadAfterSync(allNewEmails)
  return { synced }
}

// Syncs one user's mailbox for messages related to a single partner only (all of its
// contacts + additionalAddresses, plus the company domain when autoIncludeDomain is on)
// — used to backfill a newly assigned NegotiationAssignee and to power the "sync all
// assignees" button, both of which must stay scoped to this one partner, not the user's
// whole inbox.
export async function syncGmailForNegotiationRecord(
  userId: string,
  projectId: string,
  globalRecordId: string,
  lookbackDays: number,
): Promise<{ synced: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
    },
  })

  if (!user?.accessToken) return { synced: 0 }

  const accessToken = await ensureFreshToken(user)

  const domainCtx = await buildDomainContext([globalRecordId])
  const ctx = domainCtx.get(globalRecordId)
  if (ctx) ctx.projectId = projectId

  const record = await prisma.globalRecord.findUnique({
    where: { id: globalRecordId },
    select: {
      contacts: { select: { address: true } },
      negotiations: {
        where: { projectId },
        select: { additionalAddresses: { select: { address: true } } },
      },
    },
  })
  if (!record) return { synced: 0 }

  const partnerEmailMap = new Map<string, PartnerEmailEntry[]>()
  const addresses = new Set<string>()

  for (const c of record.contacts) {
    if (!c.address) continue
    const addr = c.address.toLowerCase()
    if (ctx?.blacklistedEmails.has(addr)) continue
    addresses.add(addr)
    partnerEmailMap.set(addr, [{ globalRecordId, projectId }])
  }
  for (const neg of record.negotiations) {
    for (const a of neg.additionalAddresses) {
      const addr = a.address.toLowerCase()
      if (ctx?.blacklistedEmails.has(addr)) continue
      addresses.add(addr)
      partnerEmailMap.set(addr, [{ globalRecordId, projectId }])
    }
  }

  const queryParts: string[] = []
  for (const addr of addresses) {
    queryParts.push(`from:${addr}`, `to:${addr}`)
  }
  if (ctx?.autoIncludeDomain) {
    for (const domain of ctx.domains) {
      queryParts.push(`from:@${domain}`, `to:@${domain}`)
    }
  }

  if (queryParts.length === 0) return { synced: 0 }

  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const afterDate = lookbackDate < oneYearAgo ? oneYearAgo : lookbackDate

  const afterTimestamp = Math.floor(afterDate.getTime() / 1000)
  const query = `(${queryParts.join(' OR ')}) after:${afterTimestamp} -in:draft`

  let synced = 0
  let pageToken: string | undefined
  const allNewEmails: NewEmailRecord[] = []

  do {
    const listing = await listGmailMessages(accessToken, query, pageToken)
    const messageIds = listing.messages ?? []
    pageToken = listing.nextPageToken

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(m => getGmailMessage(accessToken, m.id).catch(() => null)),
      )

      for (const msg of results) {
        if (!msg) continue
        const result = await processMessage(msg, userId, user.email, partnerEmailMap, domainCtx)
        synced += result.created
        allNewEmails.push(...result.newEmails)
      }

      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  } while (pageToken)

  await normalizeUnreadAfterSync(allNewEmails)
  return { synced }
}

type PartnerEmailEntry = { globalRecordId: string; projectId: string }

function projectIdsForRecord(
  partnerEmailMap: Map<string, PartnerEmailEntry[]>,
  globalRecordId: string,
): string[] {
  const ids = new Set<string>()
  for (const entries of partnerEmailMap.values()) {
    for (const entry of entries) {
      if (entry.globalRecordId === globalRecordId && entry.projectId) {
        ids.add(entry.projectId)
      }
    }
  }
  return [...ids]
}

function addToMap(
  map: Map<string, PartnerEmailEntry[]>,
  email: string,
  entry: PartnerEmailEntry,
) {
  const existing = map.get(email) ?? []
  if (!existing.some(e => e.globalRecordId === entry.globalRecordId && e.projectId === entry.projectId)) {
    existing.push(entry)
  }
  map.set(email, existing)
}

const ASSIGNMENT_SELECT = {
  globalRecordId: true,
  projectId: true,
  globalRecord: {
    select: {
      contacts: { select: { address: true } },
      negotiations: {
        select: { projectId: true, additionalAddresses: { select: { address: true } } },
      },
    },
  },
} as const

type AssignmentRow = {
  globalRecordId: string
  projectId: string
  globalRecord: {
    contacts: { address: string | null }[]
    negotiations: { projectId: string; additionalAddresses: { address: string }[] }[]
  }
}

function populatePartnerEmailMap(map: Map<string, PartnerEmailEntry[]>, assignments: AssignmentRow[]) {
  for (const assign of assignments) {
    const entry: PartnerEmailEntry = { globalRecordId: assign.globalRecordId, projectId: assign.projectId }
    for (const contact of assign.globalRecord.contacts) {
      if (!contact.address) continue
      addToMap(map, contact.address.toLowerCase(), entry)
    }
    const negotiation = assign.globalRecord.negotiations.find(neg => neg.projectId === assign.projectId)
    if (negotiation) {
      for (const addr of negotiation.additionalAddresses) {
        addToMap(map, addr.address.toLowerCase(), entry)
      }
    }
  }
}

async function collectPartnerEmails(
  userId: string,
  _isAdmin: boolean,
): Promise<Map<string, PartnerEmailEntry[]>> {
  const map = new Map<string, PartnerEmailEntry[]>()

  // Outreach-based assignments (oslovení) + additionalAddresses
  const outreachAssigned = await prisma.outreachAssignment.findMany({
    where: { assigneeId: userId },
    select: ASSIGNMENT_SELECT,
  })
  populatePartnerEmailMap(map, outreachAssigned)

  // Negotiation-based assignments (jednání) + additionalAddresses
  const negotiationAssigned = await prisma.negotiationAssignee.findMany({
    where: { userId },
    select: ASSIGNMENT_SELECT,
  })
  populatePartnerEmailMap(map, negotiationAssigned)

  return map
}

type NewEmailRecord = { id: string; negotiationId: string; direction: 'SENT' | 'RECEIVED'; sentAt: Date }

async function processMessage(
  msg: GmailMessage,
  userId: string,
  userEmail: string,
  partnerEmailMap: Map<string, PartnerEmailEntry[]>,
  domainCtx?: Map<string, PartnerDomainContext>,
): Promise<{ created: number; newEmails: NewEmailRecord[] }> {
  const headers = getHeaders(msg.payload)
  const from = headers.from ?? ''
  const to = headers.to ?? ''
  const cc = headers.cc ?? ''
  const bcc = headers.bcc ?? ''
  const subject = headers.subject ?? ''
  const date = headers.date ?? ''

  const allAddresses = new Set([
    ...extractEmailAddresses(from),
    ...extractEmailAddresses(to),
    ...extractEmailAddresses(cc),
    ...extractEmailAddresses(bcc),
  ])

  const matchedEntries: PartnerEmailEntry[] = []
  const seenRecords = new Set<string>()
  const matchedViaKnown = new Set<string>()
  const newlyDiscovered = new Map<string, string>()
  const normalizedUserEmail = userEmail.toLowerCase()

  for (const addr of allAddresses) {
    const entries = partnerEmailMap.get(addr)
    if (entries) {
      for (const entry of entries) {
        if (domainCtx?.get(entry.globalRecordId)?.blacklistedEmails.has(addr)) continue
        matchedViaKnown.add(entry.globalRecordId)
        if (!seenRecords.has(entry.globalRecordId)) {
          seenRecords.add(entry.globalRecordId)
          matchedEntries.push(entry)
        }
      }
    }

    if (addr !== normalizedUserEmail && domainCtx) {
      const domain = getDomainFromEmail(addr)
      if (domain) {
        for (const [globalRecordId, ctx] of domainCtx.entries()) {
          if (ctx.autoIncludeDomain && ctx.domains.has(domain) && !ctx.blacklistedEmails.has(addr)) {
            const projectIds = projectIdsForRecord(partnerEmailMap, globalRecordId)
            const primaryProjectId = projectIds[0] ?? ctx.projectId
            if (!seenRecords.has(globalRecordId)) {
              seenRecords.add(globalRecordId)
              matchedEntries.push({ globalRecordId, projectId: primaryProjectId })
            }
            if (!ctx.knownEmails.has(addr)) {
              // ponytail: multi-project partners get additionalAddresses on every assigned project;
              // matchedEntries still picks one primaryProjectId per message (pre-existing ceiling).
              const targets = projectIds.length ? projectIds : (ctx.projectId ? [ctx.projectId] : [])
              for (const projectId of targets) {
                await appendProjectAdditionalAddress(projectId, globalRecordId, addr)
                newlyDiscovered.set(`${globalRecordId}:${projectId}`, addr)
                const existingMap = partnerEmailMap.get(addr) ?? []
                if (!existingMap.some(e => e.globalRecordId === globalRecordId && e.projectId === projectId)) {
                  existingMap.push({ globalRecordId, projectId })
                }
                partnerEmailMap.set(addr, existingMap)
              }
              ctx.knownEmails.add(addr)
            }
          }
        }
      }
    }
  }

  if (matchedEntries.length === 0) return { created: 0, newEmails: [] }

  const fromAddresses = extractEmailAddresses(from)
  const direction = fromAddresses.includes(normalizedUserEmail) ? 'SENT' : 'RECEIVED'

  let htmlBody = extractHtmlBody(msg.payload)
  const attachments = extractAttachments(msg.payload)

  if (attachments.length > 0) {
    const gmailLink = `https://mail.google.com/mail/u/0/#all/${msg.id}`
    const attachmentList = attachments.map(a => a.filename).join(', ')
    htmlBody += `\n<!-- Attachments: ${attachmentList} | View in Gmail: ${gmailLink} -->`
  }

  const sentAt = date ? new Date(date) : new Date(Number(msg.internalDate))

  let created = 0
  const newEmails: NewEmailRecord[] = []
  for (const entry of matchedEntries) {
    const unknownAddr = matchedViaKnown.has(entry.globalRecordId)
      ? null
      : (newlyDiscovered.get(`${entry.globalRecordId}:${entry.projectId}`) ?? null)

    const newStatus = direction === 'SENT' ? 'WAITING_FOR_THEM' : 'WAITING_FOR_US'
    const negotiation = await prisma.negotiation.upsert({
      where: { projectId_globalRecordId: { projectId: entry.projectId, globalRecordId: entry.globalRecordId } },
      create: { projectId: entry.projectId, globalRecordId: entry.globalRecordId, negotiationStatus: newStatus },
      update: {},
    })
    await prisma.negotiation.updateMany({
      where: {
        globalRecordId: entry.globalRecordId,
        projectId: entry.projectId,
        OR: [
          { negotiationStatus: null },
          { negotiationStatus: { notIn: ['NOT_INTERESTED', 'NOT_THIS_TIME', 'COMPLETED', 'THANKS_REMAINING'] } },
        ],
      },
      data: { negotiationStatus: newStatus },
    })

    try {
      const email = await prisma.email.create({
        data: {
          negotiationId: negotiation.id,
          direction,
          subject,
          sentAt,
          fromAddress: from,
          toAddress: to,
          ccAddress: cc || null,
          gmailId: msg.id,
          threadId: msg.threadId,
          content: htmlBody,
          createdBy: userId,
          isRead: direction === 'SENT',
          isUnknownContact: !!unknownAddr,
          unknownContactAddress: unknownAddr,
        },
      })
      created++
      newEmails.push({ id: email.id, negotiationId: negotiation.id, direction, sentAt })
    } catch (e: any) {
      if (e?.code === 'P2002') continue
      throw e
    }
  }

  return { created, newEmails }
}

// We don't track Gmail's own read/unread state — isRead is purely internal. A message is
// only genuinely unhandled if it arrived after the last e-mail we sent in that negotiation,
// so a bulk historical sync (e.g. right after adding a partner) must not mark old inbound
// messages that precede a later outgoing reply as unread. Only touches rows created by this
// sync call — never overrides a user's own manual read/unread toggle on older e-mails.
async function normalizeUnreadAfterSync(newEmails: NewEmailRecord[]) {
  if (newEmails.length === 0) return

  const negotiationIds = [...new Set(newEmails.map(e => e.negotiationId))]

  for (const negotiationId of negotiationIds) {
    const lastSent = await prisma.email.findFirst({
      where: { negotiationId, direction: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    })
    if (!lastSent?.sentAt) continue
    const lastSentAt = lastSent.sentAt

    const idsToMarkRead = newEmails
      .filter(e => e.negotiationId === negotiationId && e.direction === 'RECEIVED' && e.sentAt <= lastSentAt)
      .map(e => e.id)
    if (idsToMarkRead.length === 0) continue

    await prisma.email.updateMany({
      where: { id: { in: idsToMarkRead } },
      data: { isRead: true },
    })
  }
}

function getHeaders(payload: GmailMessagePart): Record<string, string> {
  const result: Record<string, string> = {}
  for (const h of payload.headers ?? []) {
    result[h.name.toLowerCase()] = h.value
  }
  return result
}

function extractEmailAddresses(headerValue: string): string[] {
  const addresses: string[] = []
  const angleBracketRegex = /<([^>]+)>/g
  let match
  while ((match = angleBracketRegex.exec(headerValue)) !== null) {
    addresses.push(match[1].toLowerCase())
  }
  if (addresses.length === 0 && headerValue.includes('@')) {
    const bareEmailRegex = /[\w.+-]+@[\w.-]+\.\w+/g
    while ((match = bareEmailRegex.exec(headerValue)) !== null) {
      addresses.push(match[0].toLowerCase())
    }
  }
  return addresses
}

function extractHtmlBody(payload: GmailMessagePart): string {
  if (payload.mimeType === 'text/html' && payload.body.data) {
    return base64UrlDecode(payload.body.data)
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body.data) {
        return base64UrlDecode(part.body.data)
      }
    }
    for (const part of payload.parts) {
      const nested = extractHtmlBody(part)
      if (nested) return nested
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        return base64UrlDecode(part.body.data)
      }
    }
  }

  if (payload.mimeType === 'text/plain' && payload.body.data) {
    return base64UrlDecode(payload.body.data)
  }

  return ''
}

function extractAttachments(payload: GmailMessagePart): { filename: string; mimeType: string }[] {
  const attachments: { filename: string; mimeType: string }[] = []

  function walk(part: GmailMessagePart) {
    if (part.filename && part.filename.length > 0 && part.body.attachmentId) {
      attachments.push({ filename: part.filename, mimeType: part.mimeType })
    }
    if (part.parts) {
      for (const child of part.parts) walk(child)
    }
  }

  walk(payload)
  return attachments
}

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

