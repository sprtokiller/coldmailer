import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const total = await p.partnerContact.count()
  console.log('Total PartnerContact rows:', total)

  const all = await p.partnerContact.findMany({ orderBy: { createdAt: 'asc' } })

  // Find duplicates by (globalRecordId, address)
  const seen = new Map<string, number>()
  for (const c of all) {
    const key = `${c.globalRecordId}||${c.address}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const dupes = [...seen.entries()].filter(([, cnt]) => cnt > 1)
  console.log('Duplicate (globalRecordId, address) groups:', dupes.length)
  for (const [key, cnt] of dupes) {
    console.log(`  ${key}  x${cnt}`)
  }

  // Also check payload.contacts arrays for duplicates
  const records = await p.globalRecord.findMany({
    where: { type: 'PARTNER' },
    select: { id: true, canonicalName: true, payload: true },
  })
  let payloadDupes = 0
  for (const r of records) {
    const pl = r.payload as Record<string, unknown>
    const contacts = Array.isArray(pl.contacts) ? pl.contacts as any[] : []
    const emails = contacts.map((c: any) => c.email?.trim()?.toLowerCase()).filter(Boolean)
    const unique = new Set(emails)
    if (unique.size < emails.length) {
      payloadDupes++
      console.log(`  [payload dupe] ${r.canonicalName}: emails = ${emails.join(', ')}`)
    }
  }
  console.log(`Partners with duplicate emails in payload.contacts: ${payloadDupes}`)
  console.log(`Sample (last 5 PartnerContact rows):`)
  const sample = all.slice(-5)
  for (const c of sample) { console.log(`  ${c.address} | ${c.firstName} ${c.lastName} | primary=${c.isPrimary}`) }
}
main().catch(console.error).finally(() => p.$disconnect())
