import { prisma } from '~/server/utils/prisma'
import {
  refreshAccessToken,
  listGmailMessages,
  getGmailMessage,
  type GmailMessage,
  type GmailMessagePart,
} from '~/server/utils/google'

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
      projectRecords: {
        select: { contactBlacklist: true, additionalAddresses: true, autoIncludeDomain: true },
      },
    },
  })

  const result = new Map<string, PartnerDomainContext>()

  for (const rec of records) {
    const domains = new Set<string>()
    const knownEmails = new Set<string>()
    const blacklistedEmails = new Set<string>()

    for (const c of rec.contacts) {
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

    for (const pr of rec.projectRecords) {
      if (Array.isArray(pr.contactBlacklist)) {
        for (const email of pr.contactBlacklist) {
          if (typeof email === 'string') blacklistedEmails.add(email.toLowerCase())
        }
      }
      // Include project-specific addresses as known so they don't get auto-promoted to global contacts
      if (Array.isArray(pr.additionalAddresses)) {
        for (const email of pr.additionalAddresses) {
          if (typeof email === 'string') knownEmails.add(email.toLowerCase())
        }
      }
    }

    const hasCompanyDomain = domains.size > 0
    // null stored value → default to true when a company domain exists (backward-compat)
    const autoIncludeDomain = rec.projectRecords.some(
      pr => pr.autoIncludeDomain === true || (pr.autoIncludeDomain === null && hasCompanyDomain),
    ) || (rec.projectRecords.length === 0 && hasCompanyDomain)

    result.set(rec.id, { domains, knownEmails, blacklistedEmails, projectId: '', autoIncludeDomain })
  }

  return result
}

export async function syncGmailForUser(userId: string, options?: { forceLookbackDays?: number }): Promise<{ synced: number }> {
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

  if (!user?.accessToken) return { synced: 0 }

  const accessToken = await ensureFreshToken(user)

  const historyDays = await getEmailSyncHistoryDays()
  const afterDate = options?.forceLookbackDays
    ? (() => { const d = new Date(); d.setDate(d.getDate() - options.forceLookbackDays!); return d })()
    : computeSyncStart(user.lastGmailSync, user.createdAt, historyDays)
  const partnerEmailMap = await collectPartnerEmails(user.id, user.isAdmin)

  if (partnerEmailMap.size === 0) {
    return { synced: 0 }
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
        synced += await processMessage(msg, user.id, user.email, partnerEmailMap, domainCtx)
      }

      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  } while (pageToken)

  await prisma.user.update({ where: { id: userId }, data: { lastGmailSync: new Date() } })
  return { synced }
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

  const record = await prisma.globalRecord.findUnique({
    where: { id: globalRecordId },
    select: {
      interactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { projectId: true } },
    },
  })

  const projectId = record?.interactions[0]?.projectId

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
        synced += await processMessage(msg, userId, user.email, partnerEmailMap, domainCtx)
      }

      if (i + BATCH_SIZE < messageIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }
  } while (pageToken)

  return { synced }
}

type PartnerEmailEntry = { globalRecordId: string; projectId: string }

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

async function collectPartnerEmails(
  userId: string,
  _isAdmin: boolean,
): Promise<Map<string, PartnerEmailEntry[]>> {
  const map = new Map<string, PartnerEmailEntry[]>()

  // Outreach-based assignments + additionalAddresses
  const outreachAssigned = await prisma.outreachAssignment.findMany({
    where: { assigneeId: userId },
    select: {
      globalRecordId: true,
      projectId: true,
      globalRecord: {
        select: {
          contacts: { select: { address: true } },
          projectRecords: {
            select: { projectId: true, additionalAddresses: true },
          },
        },
      },
    },
  })

  for (const assign of outreachAssigned) {
    const entry: PartnerEmailEntry = { globalRecordId: assign.globalRecordId, projectId: assign.projectId }
    for (const contact of assign.globalRecord.contacts) {
      addToMap(map, contact.address.toLowerCase(), entry)
    }
    const projRecord = assign.globalRecord.projectRecords.find(pr => pr.projectId === assign.projectId)
    if (projRecord && Array.isArray(projRecord.additionalAddresses)) {
      for (const addr of projRecord.additionalAddresses) {
        if (typeof addr === 'string') addToMap(map, addr.toLowerCase(), entry)
      }
    }
  }

  return map
}

async function processMessage(
  msg: GmailMessage,
  userId: string,
  userEmail: string,
  partnerEmailMap: Map<string, PartnerEmailEntry[]>,
  domainCtx?: Map<string, PartnerDomainContext>,
): Promise<number> {
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
  const normalizedUserEmail = userEmail.toLowerCase()

  for (const addr of allAddresses) {
    const entries = partnerEmailMap.get(addr)
    if (entries) {
      for (const entry of entries) {
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
            if (!seenRecords.has(globalRecordId)) {
              seenRecords.add(globalRecordId)
              matchedEntries.push({ globalRecordId, projectId: ctx.projectId })
            }
            if (!ctx.knownEmails.has(addr)) {
              prisma.partnerContact.create({
                data: {
                  globalRecordId,
                  address: addr,
                  label: 'Auto-added (domain match)'
                }
              }).catch(() => {})
              ctx.knownEmails.add(addr)
              
              const existingMap = partnerEmailMap.get(addr) ?? []
              existingMap.push({ globalRecordId, projectId: ctx.projectId })
              partnerEmailMap.set(addr, existingMap)
            }
          }
        }
      }
    }
  }

  if (matchedEntries.length === 0) return 0

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
  for (const entry of matchedEntries) {
    try {
      await prisma.interaction.create({
        data: {
          globalRecordId: entry.globalRecordId,
          projectId: entry.projectId,
          type: 'EMAIL',
          direction,
          subject,
          sentAt,
          fromAddress: from,
          toAddress: to,
          gmailId: msg.id,
          content: htmlBody,
          createdBy: userId,
          isUnknownContact: false,
        },
      })
      created++

      const newStatus = direction === 'SENT' ? 'WAITING_FOR_THEM' : 'WAITING_FOR_US'
      await prisma.projectRecord.updateMany({
        where: {
          globalRecordId: entry.globalRecordId,
          projectId: entry.projectId,
          OR: [
            { actionStatus: null },
            { actionStatus: { notIn: ['BEFORE_MEETING', 'NONE'] } },
          ],
        },
        data: { actionStatus: newStatus },
      })
    } catch (e: any) {
      if (e?.code === 'P2002') continue
      throw e
    }
  }

  return created
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

