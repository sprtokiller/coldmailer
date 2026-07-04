import { prisma } from '~/server/utils/prisma'

interface ProfileContact {
  id?: string
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
 * Synchronizes the PartnerContact table with the given list of contacts from the partner
 * profile editor. The caller (PartnerFormModal) always seeds its form from the live
 * `contacts` relation, so the incoming list represents the complete desired end state:
 * - Contacts with an `id` are updated in place (works whether or not they have an email —
 *   a name-only contact is valid).
 * - Contacts without an `id` are new: upserted by address if they have an email (so a
 *   freshly-typed email that already matches an independently-created row, e.g. via
 *   Gmail-sync, merges into it instead of erroring), otherwise created fresh.
 * - Any existing non-primary contact whose id isn't in the incoming/created set is treated
 *   as removed by the user and deleted.
 */
export async function syncProfileContactsToDb(
  globalRecordId: string,
  contacts: ProfileContact[],
): Promise<void> {
  const keepIds = new Set(contacts.filter(c => c.id).map(c => c.id!))

  for (const c of contacts) {
    const address = c.email?.trim() ? c.email.trim().toLowerCase() : null
    const data = {
      firstName: c.firstName || null,
      lastName: c.lastName || null,
      label: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
      role: c.role || null,
      contactType: c.type || null,
      priority: c.priority ?? 3,
      note: c.note || null,
    }

    if (c.id) {
      await prisma.partnerContact.update({ where: { id: c.id }, data: { ...data, address } }).catch(() => {})
      continue
    }

    const created = address
      ? await prisma.partnerContact.upsert({
          where: { globalRecordId_address: { globalRecordId, address } },
          create: { globalRecordId, address, ...data },
          update: data,
        }).catch(() => null)
      : await prisma.partnerContact.create({ data: { globalRecordId, address: null, ...data } }).catch(() => null)
    if (created) keepIds.add(created.id)
  }

  // Remove contacts the user explicitly took out of the list in the editor.
  // Contacts explicitly marked as primary are preserved regardless.
  await prisma.partnerContact.deleteMany({
    where: {
      globalRecordId,
      isPrimary: false,
      id: { notIn: [...keepIds] },
    },
  })
}
