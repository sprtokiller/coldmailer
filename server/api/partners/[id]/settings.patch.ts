import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'
import { getDomainFromUrl } from '~/server/utils/gmail-sync'

// Normalizuje vstup na holou doménu (podporuje i vloženou URL). Prázdné → null.
function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.includes('/') || trimmed.includes('://')) {
    const withProto = /:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
    return getDomainFromUrl(withProto) || null
  }
  return trimmed.replace(/^www\./, '').replace(/^@/, '')
}

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)

  if (!projectId) return { ok: true }

  const body = await readBody<{
    contactBlacklist?: string[]
    emailDisplayMode?: string
    additionalAddresses?: string[]
    autoIncludeDomain?: boolean
    domainOverride?: string | null
  }>(event)

  // emailDisplayMode je jen zobrazovací přepínač (Text/HTML náhled) dostupný i divákům –
  // historicky bez kontroly. Citlivá nastavení (doména, blacklist, přídavné adresy) smí
  // měnit jen kdokoli s právem editace jednání (přiřazený nebo vedení obchodu).
  const changesSensitive = body.contactBlacklist !== undefined
    || body.additionalAddresses !== undefined
    || body.autoIncludeDomain !== undefined
    || body.domainOverride !== undefined
  if (changesSensitive) {
    const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
    if (!canEdit) {
      throw createError({ statusCode: 403, message: 'Nemáte oprávnění upravovat nastavení tohoto jednání. Nejste přiřazeni k tomuto partnerovi.' })
    }
  }

  const scalarData: Record<string, unknown> = {}
  if (body.emailDisplayMode !== undefined) scalarData.emailDisplayMode = body.emailDisplayMode
  if (body.autoIncludeDomain !== undefined) scalarData.autoIncludeDomain = body.autoIncludeDomain
  if (body.domainOverride !== undefined) {
    scalarData.domainOverride = body.domainOverride ? normalizeDomain(body.domainOverride) : null
  }

  const newBlacklist = body.contactBlacklist !== undefined ? [...new Set(body.contactBlacklist)] : undefined
  const newAddresses = body.additionalAddresses !== undefined ? [...new Set(body.additionalAddresses)] : undefined

  if (Object.keys(scalarData).length === 0 && newBlacklist === undefined && newAddresses === undefined) {
    return { ok: true }
  }

  const existing = await prisma.negotiation.findUnique({
    where: { projectId_globalRecordId: { globalRecordId, projectId } },
    select: {
      blacklistedAddresses: { select: { address: true } },
      additionalAddresses: { select: { address: true } },
    },
  })

  const currentBlacklist = existing?.blacklistedAddresses.map(a => a.address) ?? []
  const currentAddresses = existing?.additionalAddresses.map(a => a.address) ?? []

  // Cross-validate: an address cannot be in both lists
  if (newBlacklist !== undefined || newAddresses !== undefined) {
    const blacklist = newBlacklist ?? currentBlacklist
    const addresses = newAddresses ?? currentAddresses
    const blacklistSet = new Set(blacklist)
    const overlap = addresses.filter(e => blacklistSet.has(e))
    if (overlap.length > 0) {
      throw createError({
        statusCode: 400,
        message: `E-mail ${overlap[0]} nemůže být v blacklistu i v přídavných adresách zároveň.`,
      })
    }
  }

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { globalRecordId, projectId } },
    create: { globalRecordId, projectId, ...scalarData },
    update: scalarData,
  })

  if (newBlacklist !== undefined) {
    const toRemove = currentBlacklist.filter(a => !newBlacklist.includes(a))
    const toAdd = newBlacklist.filter(a => !currentBlacklist.includes(a))
    await prisma.negotiationBlacklistedAddress.deleteMany({
      where: { negotiationId: negotiation.id, address: { in: toRemove } },
    })
    if (toAdd.length > 0) {
      await prisma.negotiationBlacklistedAddress.createMany({
        data: toAdd.map(address => ({ negotiationId: negotiation.id, address })),
        skipDuplicates: true,
      })
    }
  }

  if (newAddresses !== undefined) {
    const toRemove = currentAddresses.filter(a => !newAddresses.includes(a))
    const toAdd = newAddresses.filter(a => !currentAddresses.includes(a))
    await prisma.negotiationAddress.deleteMany({
      where: { negotiationId: negotiation.id, address: { in: toRemove } },
    })
    if (toAdd.length > 0) {
      await prisma.negotiationAddress.createMany({
        data: toAdd.map(address => ({ negotiationId: negotiation.id, address })),
        skipDuplicates: true,
      })
    }
  }

  return { ok: true }
})
