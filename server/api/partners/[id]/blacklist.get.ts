import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'
import { FREE_EMAIL_DOMAINS, getDomainFromEmail, getDomainFromUrl } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)

  if (!projectId) return { blacklist: [], emailDisplayMode: 'text', domains: [] }

  const record = await prisma.globalRecord.findUnique({
    where: { id: globalRecordId },
    select: {
      payload: true,
      contacts: { select: { address: true } },
      projectRecords: {
        where: { projectId },
        select: { contactBlacklist: true, emailDisplayMode: true }
      }
    }
  })
  
  const projRecord = record?.projectRecords[0]
  
  const domains = new Set<string>()
  if (record) {
    for (const c of record.contacts) {
      const domain = getDomainFromEmail(c.address.toLowerCase())
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        domains.add(domain)
      }
    }

    const payload = record.payload as Record<string, unknown> | null
    const website = String(payload?.website ?? payload?.url ?? '')
    if (website) {
      const domain = getDomainFromUrl(website)
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        domains.add(domain)
      }
    }
  }

  return {
    blacklist: Array.isArray(projRecord?.contactBlacklist)
      ? (projRecord.contactBlacklist as string[])
      : [],
    emailDisplayMode: projRecord?.emailDisplayMode ?? 'text',
    domains: Array.from(domains),
  }
})
