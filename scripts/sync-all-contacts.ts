/**
 * Cleanup: pro každého partnera synchronizuje PartnerContact tabulku
 * s aktuálním stavem payload.contacts (full-replace).
 *
 * Run: npx tsx scripts/sync-all-contacts.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface PayloadContact {
  email?: string
  firstName?: string
  lastName?: string
  role?: string
  type?: string
  priority?: number
  note?: string
}

async function main() {
  const partners = await prisma.globalRecord.findMany({
    where: { type: 'PARTNER' },
    select: { id: true, canonicalName: true, payload: true },
  })

  let totalDeleted = 0
  let totalUpserted = 0

  for (const p of partners) {
    const pl = p.payload as Record<string, unknown>
    const payloadContacts: PayloadContact[] = Array.isArray(pl.contacts) ? pl.contacts as PayloadContact[] : []
    const withEmail = payloadContacts.filter(c => c.email?.trim())
    const incomingAddresses = new Set(withEmail.map(c => c.email!.trim().toLowerCase()))

    // Upsert each contact from payload
    for (const c of withEmail) {
      const address = c.email!.trim().toLowerCase()
      await prisma.partnerContact.upsert({
        where: { globalRecordId_address: { globalRecordId: p.id, address } },
        create: {
          globalRecordId: p.id,
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
      })
      totalUpserted++
    }

    // Delete stale non-primary contacts not in payload. Name-only contacts (address: null)
    // aren't represented in payload.contacts entries here, so never touch those.
    const deleted = await prisma.partnerContact.deleteMany({
      where: {
        globalRecordId: p.id,

        address: { not: null, notIn: [...incomingAddresses] },
      },
    })
    if (deleted.count > 0) {
      console.log(`[${p.canonicalName}] Smazáno ${deleted.count} zastaralých kontaktů`)
      totalDeleted += deleted.count
    }
  }

  console.log(`\nHotovo. Zpracováno ${partners.length} partnerů.`)
  console.log(`Upsertováno: ${totalUpserted}, smazáno zastaralých: ${totalDeleted}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
