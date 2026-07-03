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

  const projRec = await prisma.projectRecord.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { contactBlacklist: true, additionalAddresses: true },
  })

  const blacklisted = Array.isArray(projRec?.contactBlacklist)
    ? (projRec.contactBlacklist as string[]).includes(normalized)
    : false
  if (blacklisted) return false

  const current = Array.isArray(projRec?.additionalAddresses)
    ? (projRec.additionalAddresses as string[])
    : []
  if (current.includes(normalized)) return false

  await prisma.projectRecord.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, additionalAddresses: [normalized] },
    update: { additionalAddresses: [...current, normalized] },
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
  const projRec = await prisma.projectRecord.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { additionalAddresses: true },
  })

  const current = Array.isArray(projRec?.additionalAddresses)
    ? (projRec.additionalAddresses as string[])
    : []
  if (!current.includes(normalized)) return

  const updated = current.filter(a => a !== normalized)
  await prisma.projectRecord.update({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    data: { additionalAddresses: updated.length ? updated : null },
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
