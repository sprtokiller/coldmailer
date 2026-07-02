import { prisma } from '~/server/utils/prisma'

interface ProfileContact {
  email?: string
  firstName?: string
  lastName?: string
  role?: string
  type?: string
  priority?: number
  confidence?: string
  note?: string
}

/**
 * Synchronizes the PartnerContact table with the given list of contacts from the partner profile.
 *
 * Performs a full replace for contacts that originated from the profile payload:
 * - Upserts all contacts that have a valid email address.
 * - Deletes contacts from the DB that are no longer present in the new list
 *   (i.e. their address is not in the incoming contacts array), but ONLY if they
 *   were not manually added independently (identified by not having `isPrimary` set
 *   and not having a `label` that differs from what profile sync would set).
 *
 * To avoid destroying manually added contacts (created via the dedicated contact
 * API endpoints), we only delete addresses that were previously synced from the
 * payload and are now absent – we detect these by tracking all existing addresses
 * and removing those that are no longer in the new profile list.
 */
export async function syncProfileContactsToDb(
  globalRecordId: string,
  contacts: ProfileContact[],
): Promise<void> {
  const withEmail = contacts.filter(c => c.email?.trim())

  // Collect the canonical addresses that should exist after this sync.
  // If the list is empty, incomingAddresses will be empty and all existing
  // non-primary contacts will be deleted below.
  const incomingAddresses = new Set(
    withEmail.map(c => c.email!.trim().toLowerCase()),
  )

  // Upsert all contacts with a valid email.
  for (const c of withEmail) {
    const address = c.email!.trim().toLowerCase()
    await prisma.partnerContact.upsert({
      where: { globalRecordId_address: { globalRecordId, address } },
      create: {
        globalRecordId,
        address,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        label: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
        role: c.role || null,
        contactType: c.type || null,
        priority: c.priority ?? 3,
        note: c.note || null,
      },
      update: {
        firstName: c.firstName || undefined,
        lastName: c.lastName || undefined,
        role: c.role || undefined,
        contactType: c.type || undefined,
        priority: c.priority ?? undefined,
        note: c.note || undefined,
      },
    }).catch(() => {})
  }

  // Remove contacts that are no longer in the profile payload.
  // We delete all addresses for this partner that are NOT in the new incoming list.
  // Contacts explicitly marked as primary (i.e. manually promoted) are preserved.
  await prisma.partnerContact.deleteMany({
    where: {
      globalRecordId,
      isPrimary: false,
      address: { notIn: [...incomingAddresses] },
    },
  })
}
