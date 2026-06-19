import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ARGUMENT_NAMES = [
  'Nábor talentů',
  'Přístup ke školám',
  'CSR a branding',
  'Flexibilní spolupráce',
  'Program na Grandfinále',
  'Hostování akcí',
  'Tvorba obsahu',
]

const ARGUMENT_IMPORTANCE = [
  'Klíčový',
  'Vysoký',
  'Střední',
  'Podpůrný',
  'Vysoký',
  'Doplňkový',
  'Doplňkový',
]

const NEW_SELLING_CONTENT = `- [Nábor talentů | Klíčový] Snadnější hiring a přístup k velmi kvalitně vyselektovaným technickým talentům – soutěž dlouhodobě funguje jako přirozený screening a assessment motivovaných studentů ještě před jejich vstupem na trh práce.

- [Přístup ke školám | Vysoký] Přímý kontakt se středoškolskou komunitou napříč ČR, SR, PL, DE a AU – oslovujeme školy prostřednictvím e-mailových i fyzických pozvánek pro učitele a studenty, včetně možnosti distribuce partnerských promo materiálů.

- [CSR a branding | Střední] Posílení CSR a employer brandingu – spolupráce se vzdělávací neziskovou iniciativou podporující rozvoj mladých talentů dobře zapadá do strategií společenské odpovědnosti i dlouhodobého budování značky zaměstnavatele.

- [Flexibilní spolupráce | Podpůrný] Flexibilní forma partnerství – jsme otevření i nefinanční spolupráci a barterům, pokud dávají smysl oběma stranám a přinášejí adekvátní hodnotu.

- [Program na Grandfinále | Vysoký] Možnost vlastního programu na Grandfinále – partner může realizovat workshop, odbornou přednášku nebo jiný doprovodný program pro soutěžící.

- [Hostování akcí | Doplňkový] Možnost hostování offline akcí – například vyhlášení výsledků Nominačního kola, komunitní meetup nebo setkání absolventů a bývalých soutěžících (často již vysokoškoláků). Přirozený způsob, jak budovat vztah s talentovanými lidmi.

- [Tvorba obsahu | Doplňkový] Participace na tvorbě soutěžního obsahu – možnost podílet se na zadání soutěžní části nebo doprovodného Capture the Flag.`

const OLD_ID_MAP: Record<string, string> = {
  // SecondMuse
  'hiring-talent-access': 'Nábor talentů',
  'school-community-access': 'Přístup ke školám',
  'csr-employer-branding': 'CSR a branding',
  'flexible-partnership': 'Flexibilní spolupráce',
  'grandfinale-program': 'Program na Grandfinále',
  'offline-event-hosting': 'Hostování akcí',
  'content-co-creation': 'Tvorba obsahu',
  // CPD
  'content-participation': 'Tvorba obsahu',
  // SafeDX
  'arg-01': 'Nábor talentů',
  'arg-02': 'Přístup ke školám',
  'arg-03': 'CSR a branding',
  'arg-04': 'Flexibilní spolupráce',
  'arg-05': 'Program na Grandfinále',
  'arg-06': 'Hostování akcí',
  'arg-07': 'Tvorba obsahu',
  // BOIT
  'hiring-talents': 'Nábor talentů',
  'content-participation-ctf': 'Tvorba obsahu',
  'hosting-offline-events': 'Hostování akcí',
  // HPE
  'hiring-talent-screening': 'Nábor talentů',
  'kontakt-stredoskolska-komunita': 'Přístup ke školám',
  'flexibilni-partnerství': 'Flexibilní spolupráce',
  'program-grandfinale': 'Program na Grandfinále',
  'hostovani-offline-akci': 'Hostování akcí',
  'participace-obsah': 'Tvorba obsahu',
  // ARICOMA
  'hiring': 'Nábor talentů',
  'reach': 'Přístup ke školám',
  'csr': 'CSR a branding',
  'flexibility': 'Flexibilní spolupráce',
  'grandfinale': 'Program na Grandfinále',
  'hosting': 'Hostování akcí',
  'content': 'Tvorba obsahu',
}

function mapArgumentId(oldId: string): string {
  return OLD_ID_MAP[oldId] ?? oldId
}

function migrateAlignmentItem(item: Record<string, unknown>): Record<string, unknown> {
  const result = { ...item }

  if (Array.isArray(result.argumentAlignment)) {
    result.argumentAlignment = result.argumentAlignment.map((a: any) => ({
      ...a,
      argumentId: mapArgumentId(a.argumentId),
    }))
  }

  if (Array.isArray(result.top3Arguments)) {
    result.top3Arguments = result.top3Arguments.map((a: any) => ({
      ...a,
      argumentId: mapArgumentId(a.argumentId),
    }))
  }

  if (Array.isArray(result.argumentsToDrop)) {
    result.argumentsToDrop = result.argumentsToDrop.map((a: any) => ({
      ...a,
      argumentId: mapArgumentId(a.argumentId),
    }))
  }

  return result
}

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1. Update selling point content
    console.log('=== Updating SellingPoint content ===')
    const sps = await tx.sellingPoint.findMany()
    for (const sp of sps) {
      if (sp.content.includes('Snadnější hiring') && !sp.content.includes('[Nábor talentů')) {
        await tx.sellingPoint.update({
          where: { id: sp.id },
          data: { content: NEW_SELLING_CONTENT },
        })
        console.log(`  ✓ Updated: ${sp.name} (${sp.id})`)
      } else {
        console.log(`  ⊘ Skipped: ${sp.name} (already updated or different content)`)
      }
    }

    // 2. Update VALUE_ALIGNMENT outputs
    console.log('\n=== Updating VALUE_ALIGNMENT outputs ===')
    const vaSteps = await tx.pipelineStep.findMany({
      where: { stepType: 'VALUE_ALIGNMENT' },
      select: { id: true, outputData: true, pipelineRun: { select: { name: true } } },
    })

    for (const step of vaSteps) {
      const data = step.outputData
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`  ⊘ Skipped: ${step.pipelineRun.name} (${step.id}) — no data`)
        continue
      }

      const migrated = data.map((item: any) => migrateAlignmentItem(item))
      await tx.pipelineStep.update({
        where: { id: step.id },
        data: { outputData: migrated as any },
      })

      for (const item of migrated as any[]) {
        if (item.argumentAlignment) {
          const ids = item.argumentAlignment.map((a: any) => a.argumentId)
          console.log(`  ✓ ${item.name}: [${ids.join(', ')}]`)
        }
      }
    }

    // 3. Update system prompt in DB
    console.log('\n=== Updating VALUE_ALIGNMENT system prompt in DB ===')
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const { fileURLToPath } = await import('url')
    const promptContent = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'prisma', 'system-prompts', 'VALUE_ALIGNMENT.txt'), 'utf-8').trim()

    const systemPrompts = await tx.systemPrompt.findMany({
      where: { stepType: 'VALUE_ALIGNMENT' as any },
    })
    for (const sp of systemPrompts) {
      await tx.systemPrompt.update({
        where: { id: sp.id },
        data: { content: promptContent },
      })
      console.log(`  ✓ Updated prompt: ${sp.name} (${sp.id}, isSystem=${sp.isSystem})`)
    }
  })

  console.log('\nDone!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
