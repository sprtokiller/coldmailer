import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'
import { FREE_EMAIL_DOMAINS, getDomainFromEmail, getDomainFromUrl } from '~/server/utils/gmail-sync'

export function detectCompanyDomain(
  contacts: { address: string | null }[],
  payload: Record<string, unknown> | null,
): string | null {
  const domainCounts = new Map<string, number>()

  for (const c of contacts) {
    if (!c.address) continue
    const domain = getDomainFromEmail(c.address.toLowerCase())
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1)
    }
  }

  const website = String(payload?.website ?? payload?.url ?? '')
  if (website) {
    const domain = getDomainFromUrl(website)
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 2)
    }
  }

  if (domainCounts.size === 0) return null
  return [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)

  if (!projectId) return { blacklist: [], emailDisplayMode: 'text', domains: [], additionalAddresses: [], autoIncludeDomain: false, detectedDomain: null }

  const record = await prisma.globalRecord.findUnique({
    where: { id: globalRecordId },
    select: {
      payload: true,
      contacts: { select: { address: true } },
      negotiations: {
        where: { projectId },
        select: {
          emailDisplayMode: true,
          autoIncludeDomain: true,
          blacklistedAddresses: { select: { address: true } },
          additionalAddresses: { select: { address: true } },
        },
      },
    },
  })

  const negotiation = record?.negotiations[0]

  const domains = new Set<string>()
  if (record) {
    for (const c of record.contacts) {
      if (!c.address) continue
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

  const detectedDomain = record
    ? detectCompanyDomain(record.contacts, record.payload as Record<string, unknown> | null)
    : null

  // null stored value → default to true if a company domain was detected
  const autoIncludeDomain = negotiation?.autoIncludeDomain ?? (detectedDomain !== null)

  return {
    blacklist: negotiation?.blacklistedAddresses.map(a => a.address) ?? [],
    emailDisplayMode: negotiation?.emailDisplayMode ?? 'text',
    domains: Array.from(domains),
    additionalAddresses: negotiation?.additionalAddresses.map(a => a.address) ?? [],
    autoIncludeDomain,
    detectedDomain,
  }
})
