import { prisma } from '~/server/utils/prisma'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Append a project-scoped email address (skips blacklisted and duplicate entries). */
export async function appendProjectAdditionalAddress(
  projectId: string,
  globalRecordId: string,
  email: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!normalized) return false

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId },
    update: {},
  })

  const blacklisted = await prisma.negotiationBlacklistedAddress.findUnique({
    where: { negotiationId_address: { negotiationId: negotiation.id, address: normalized } },
  })
  if (blacklisted) return false

  const existing = await prisma.negotiationAddress.findUnique({
    where: { negotiationId_address: { negotiationId: negotiation.id, address: normalized } },
  })
  if (existing) return false

  await prisma.negotiationAddress.create({
    data: { negotiationId: negotiation.id, address: normalized },
  }).catch(() => {})

  return true
}

/** Remove a project-scoped email address from additionalAddresses. */
export async function removeProjectAdditionalAddress(
  projectId: string,
  globalRecordId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeEmail(email)
  const negotiation = await prisma.negotiation.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { id: true },
  })
  if (!negotiation) return

  await prisma.negotiationAddress.deleteMany({
    where: { negotiationId: negotiation.id, address: normalized },
  }).catch(() => {})
}

/** Track custom recipient as project-level address when not a global PartnerContact. */
export async function trackCustomRecipientAddress(
  projectId: string,
  globalRecordId: string,
  toAddress: string,
): Promise<void> {
  const normalized = normalizeEmail(toAddress)
  const existingContact = await prisma.partnerContact.findUnique({
    where: { globalRecordId_address: { globalRecordId, address: normalized } },
    select: { id: true },
  })
  if (!existingContact) {
    await appendProjectAdditionalAddress(projectId, globalRecordId, normalized)
  }
}
