/**
 * Oprava nekonzistentních dat v kroku MARKET_SCANNING.
 *
 * Problém: InputSource záznamy existují v DB, ale PipelineRecordRef vazby chybí
 *          → canvas zobrazuje 0 soutěží a boční panel je prázdný.
 *
 * Co skript dělá:
 *  1. Najde nejnovější PipelineStep typu MARKET_SCANNING.
 *  2. Vyhledá GlobalRecord záznamy (type=COMPETITION) jejichž canonicalName
 *     nebo payload obsahují "hackathon" (case-insensitive).
 *  3. Najde nebo vytvoří InputSource (MINI_DEEP_RESEARCH) pro daný krok.
 *  4. Upsertne PipelineRecordRef pro každý nalezený záznam
 *     (isSelectedForProcessing=true, addMethod=GENERATED).
 *  5. Pokud je outputData prázdné/null, rekonstruuje ho z payloadů GlobalRecord.
 *
 * Spuštění:  bun scripts/fix-market-scanning-refs.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍  Hledám nejnovější krok MARKET_SCANNING…\n')

  const step = await prisma.pipelineStep.findFirst({
    where: { stepType: 'MARKET_SCANNING' },
    orderBy: { createdAt: 'desc' },
    include: {
      pipelineRun: { select: { id: true, authorId: true, name: true } },
      inputSources: true,
      recordRefs: { select: { id: true, globalRecordId: true, addMethod: true } },
    },
  })

  if (!step) {
    console.log('❌  Žádný krok MARKET_SCANNING nebyl nalezen.')
    return
  }

  const runId = step.pipelineRun.id
  const userId = step.pipelineRun.authorId

  console.log(`✅  Krok nalezen:`)
  console.log(`    Run:       ${step.pipelineRun.name}`)
  console.log(`    Step ID:   ${step.id}`)
  console.log(`    Status:    ${step.status}`)
  console.log(`    InputSources: ${step.inputSources.length}`)
  console.log(`    RecordRefs:   ${step.recordRefs.length}\n`)

  // ── 2. Vyhledej COMPETITION GlobalRecords s "hackathon" ─────────────────────

  console.log('🔍  Hledám GlobalRecord záznamy s "hackathon" (COMPETITION)…')

  // canonicalName - Prisma filter
  const byName = await prisma.globalRecord.findMany({
    where: {
      type: 'COMPETITION',
      canonicalName: { contains: 'hackathon', mode: 'insensitive' },
    },
  })

  // payload::text ILIKE — raw SQL (JSONB cast)
  const byPayloadIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "GlobalRecord"
    WHERE type = 'COMPETITION'::"RecordType"
      AND payload::text ILIKE '%hackathon%'
      AND "canonicalName" NOT ILIKE '%hackathon%'
  `

  const extraIds = byPayloadIds.map(r => r.id)
  const byPayload = extraIds.length > 0
    ? await prisma.globalRecord.findMany({ where: { id: { in: extraIds } } })
    : []

  // Deduplicate
  const seen = new Set<string>()
  const records = [...byName, ...byPayload].filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  if (records.length === 0) {
    console.log('⚠️   Žádné COMPETITION záznamy s "hackathon" nenalezeny.')
    console.log('     Zkontroluj DB — možná data vůbec neexistují.')
    return
  }

  console.log(`     Nalezeno ${records.length} záznamů:\n`)
  for (const r of records) console.log(`     · ${r.canonicalName}`)
  console.log()

  // ── 3. Najdi nebo vytvoř InputSource (MINI_DEEP_RESEARCH) ───────────────────

  let inputSource = step.inputSources.find(s => s.type === 'MINI_DEEP_RESEARCH') ?? null

  if (!inputSource) {
    console.log('➕  Vytvářím nový InputSource (MINI_DEEP_RESEARCH)…')
    inputSource = await prisma.inputSource.create({
      data: {
        type: 'MINI_DEEP_RESEARCH',
        pipelineRunId: runId,
        stepId: step.id,
        label: `Market Scanning – oprava dat ${new Date().toLocaleString('cs-CZ')}`,
        createdBy: userId,
        metadata: { fixedBy: 'fix-market-scanning-refs.ts' },
      },
    })
    console.log(`     InputSource ID: ${inputSource.id}\n`)
  } else {
    console.log(`✅  Použit existující InputSource: ${inputSource.id} (${inputSource.label})\n`)
  }

  // ── 4. Upsertni PipelineRecordRef pro každý nalezený záznam ─────────────────

  console.log('🔗  Upsertím PipelineRecordRef záznamy…')
  let created = 0; let updated = 0

  for (const record of records) {
    const existing = step.recordRefs.find(r => r.globalRecordId === record.id)

    await prisma.pipelineRecordRef.upsert({
      where: {
        pipelineRunId_stepId_globalRecordId: {
          pipelineRunId: runId,
          stepId: step.id,
          globalRecordId: record.id,
        },
      },
      create: {
        pipelineRunId: runId,
        stepId: step.id,
        globalRecordId: record.id,
        inputSourceId: inputSource.id,
        addedBy: userId,
        addMethod: 'GENERATED',
        isSelectedForProcessing: true,
      },
      update: {
        isSelectedForProcessing: true,
        addMethod: 'GENERATED',
        inputSourceId: inputSource.id,
      },
    })

    if (existing) {
      console.log(`     ~ aktualizováno: ${record.canonicalName}`)
      updated++
    } else {
      console.log(`     + vytvořeno:     ${record.canonicalName}`)
      created++
    }
  }

  console.log(`\n     Vytvořeno: ${created}, Aktualizováno: ${updated}\n`)

  // ── 5. Rekonstruuj outputData pokud je prázdné ───────────────────────────────

  const currentOutput = step.outputData
  const isEmpty = !currentOutput || (Array.isArray(currentOutput) && currentOutput.length === 0)

  if (isEmpty) {
    console.log('📝  outputData je prázdné — rekonstruuji z GlobalRecord payloadů…')
    const outputData = records.map(r => ({
      name: r.canonicalName,
      ...(r.payload as Record<string, unknown>),
    }))
    await prisma.pipelineStep.update({
      where: { id: step.id },
      data: { outputData: outputData as never },
    })
    console.log(`     Zapsáno ${outputData.length} položek do outputData.\n`)
  } else {
    const count = Array.isArray(currentOutput) ? currentOutput.length : '?'
    console.log(`ℹ️   outputData již obsahuje ${count} položek — ponecháno beze změny.\n`)
  }

  console.log('✅  Hotovo! Obnov stránku v prohlížeči — záznamy by se měly zobrazit.')
}

main()
  .catch((err) => { console.error('❌ Chyba:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
