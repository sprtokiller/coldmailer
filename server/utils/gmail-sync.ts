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

export async function syncGmailForUser(userId: string): Promise<{ synced: number }> {
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
      isSuperAdmin: true,
    },
  })

  if (!user?.accessToken) return { synced: 0 }

  const accessToken = await ensureFreshToken(user)

  const afterDate = computeSyncStart(user.lastGmailSync, user.createdAt)
  const partnerEmailMap = await collectPartnerEmails(user.id, user.isSuperAdmin)

  if (partnerEmailMap.size === 0) {
    await prisma.user.update({ where: { id: userId }, data: { lastGmailSync: new Date() } })
    return { synced: 0 }
  }

  const afterTimestamp = Math.floor(afterDate.getTime() / 1000)
  const query = `after:${afterTimestamp}`

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
        synced += await processMessage(msg, user.id, user.email, partnerEmailMap)
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

function computeSyncStart(lastSync: Date | null, createdAt: Date): Date {
  if (lastSync) return lastSync

  const oneMonthBeforeCreation = new Date(createdAt)
  oneMonthBeforeCreation.setMonth(oneMonthBeforeCreation.getMonth() - 1)

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  return oneMonthBeforeCreation < oneYearAgo ? oneYearAgo : oneMonthBeforeCreation
}

type PartnerEmailEntry = { globalRecordId: string; projectId: string }

async function collectPartnerEmails(
  userId: string,
  isSuperAdmin: boolean,
): Promise<Map<string, PartnerEmailEntry[]>> {
  let projectIds: string[]

  if (isSuperAdmin) {
    const projects = await prisma.project.findMany({ select: { id: true } })
    projectIds = projects.map(p => p.id)
  } else {
    const directProjects = await prisma.userProject.findMany({
      where: { userId },
      select: { projectId: true },
    })
    const userGroups = await prisma.userGroup.findMany({
      where: { userId },
      select: { groupId: true },
    })
    const groupProjects = userGroups.length > 0
      ? await prisma.project.findMany({
          where: { groupId: { in: userGroups.map(g => g.groupId) } },
          select: { id: true },
        })
      : []

    projectIds = [...new Set([
      ...directProjects.map(p => p.projectId),
      ...groupProjects.map(p => p.id),
    ])]
  }

  if (projectIds.length === 0) return new Map()

  const globalRecords = await prisma.globalRecord.findMany({
    where: {
      OR: [
        { interactions: { some: { projectId: { in: projectIds } } } },
        { pipelineRefs: { some: { pipelineRun: { projectId: { in: projectIds } } } } },
        { createdBy: userId },
      ],
    },
    select: {
      id: true,
      contacts: { select: { address: true } },
      interactions: {
        where: { projectId: { in: projectIds } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { projectId: true },
      },
      pipelineRefs: {
        where: { pipelineRun: { projectId: { in: projectIds } } },
        orderBy: { addedAt: 'desc' },
        take: 1,
        select: { pipelineRun: { select: { projectId: true } } },
      },
    },
  })

  const map = new Map<string, PartnerEmailEntry[]>()

  for (const record of globalRecords) {
    const projectId =
      record.interactions[0]?.projectId
      ?? record.pipelineRefs[0]?.pipelineRun.projectId
      ?? projectIds[0]

    for (const contact of record.contacts) {
      const email = contact.address.toLowerCase()
      const existing = map.get(email) ?? []
      existing.push({ globalRecordId: record.id, projectId })
      map.set(email, existing)
    }
  }

  return map
}

async function processMessage(
  msg: GmailMessage,
  userId: string,
  userEmail: string,
  partnerEmailMap: Map<string, PartnerEmailEntry[]>,
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
  }

  if (matchedEntries.length === 0) return 0

  const fromAddresses = extractEmailAddresses(from)
  const direction = fromAddresses.includes(userEmail.toLowerCase()) ? 'SENT' : 'RECEIVED'

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
        },
      })
      created++
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
