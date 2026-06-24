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

export async function syncProfileContactsToDb(
  globalRecordId: string,
  contacts: ProfileContact[],
): Promise<void> {
  const withEmail = contacts.filter(c => c.email?.trim())
  if (withEmail.length === 0) return

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
}
