/**
 * Cleanup script: removes duplicate PartnerContact records.
 *
 * For each (globalRecordId, address) pair we keep:
 *   1. The first record
 *   2. Otherwise the oldest record (lowest createdAt)
 *
 * Run with: npx tsx scripts/cleanup-duplicate-contacts.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Fetch all contacts grouped by (globalRecordId, address)
  const contacts = await prisma.partnerContact.findMany({
    orderBy: [{ globalRecordId: 'asc' }, { address: 'asc' }, { createdAt: 'asc' }],
  })

  // Group by composite key
  const groups = new Map<string, typeof contacts>()
  for (const c of contacts) {
    if (!c.address) continue // name-only contacts have no address to dedupe on
    const key = `${c.globalRecordId}||${c.address}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  let deletedTotal = 0

  for (const [key, group] of groups.entries()) {
    if (group.length <= 1) continue

    // Prefer the primary contact as the keeper; fall back to the oldest one.
    const keeper = group[0]
    const toDelete = group.filter(c => c.id !== keeper.id)

    console.log(
      `[DUPLICATE] ${key} — keeping ${keeper.id}, deleting ${toDelete.map(c => c.id).join(', ')}`,
    )

    await prisma.partnerContact.deleteMany({
      where: { id: { in: toDelete.map(c => c.id) } },
    })

    deletedTotal += toDelete.length
  }

  console.log(`\nDone. Deleted ${deletedTotal} duplicate contact(s).`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
