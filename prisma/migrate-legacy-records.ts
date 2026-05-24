/**
 * One-time migration: converts all legacy PipelineStep.outputData records
 * (from before the GlobalRecord system) into proper GlobalRecord + PipelineRecordRef rows.
 *
 * Run with:  bun prisma/migrate-legacy-records.ts
 *
 * Safe to re-run — uses upsert everywhere, skips steps that already have refs.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Name normalisation (duplicated here to avoid server-context imports) ──────

const LEGAL_SUFFIXES = /\b(s\.r\.o\.|a\.s\.|spol\.|k\.s\.|v\.o\.s\.|LLC|Ltd|GmbH|Inc|Corp|S\.A\.|N\.V\.)\b/gi
const CZECH_COMPETITION_SUFFIXES = /\b(olympiáda|soutěž|liga|challenge|hackathon|cup|championship)\b/gi
const PARENTHETICALS = /\([^)]*\)/g

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(PARENTHETICALS, '')
    .replace(LEGAL_SUFFIXES, '')
    .replace(CZECH_COMPETITION_SUFFIXES, '')
    .replace(/[,;.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertGlobalRecord(params: {
  type: 'COMPETITION' | 'PARTNER'
  name: string
  payload: Record<string, unknown>
  userId: string
}) {
  const normalizedName = normalizeName(params.name)
  if (!normalizedName) return null

  const existing = await prisma.globalRecord.findFirst({
    where: { type: params.type, normalizedName },
  })
  if (existing) return { record: existing, created: false }

  const record = await prisma.globalRecord.create({
    data: {
      type: params.type,
      canonicalName: params.name,
      normalizedName,
      payload: params.payload,
      relevanceStatus: 'UNCERTAIN',
      relevanceNotes: 'Migrováno z původní verze aplikace',
      createdBy: params.userId,
    },
  })
  return { record, created: true }
}

async function linkRef(params: {
  runId: string
  stepId: string
  globalRecordId: string
  inputSourceId: string
  userId: string
}) {
  await prisma.pipelineRecordRef.upsert({
    where: {
      pipelineRunId_stepId_globalRecordId: {
        pipelineRunId: params.runId,
        stepId: params.stepId,
        globalRecordId: params.globalRecordId,
      },
    },
    create: {
      pipelineRunId: params.runId,
      stepId: params.stepId,
      globalRecordId: params.globalRecordId,
      inputSourceId: params.inputSourceId,
      addedBy: params.userId,
      addMethod: 'IMPORTED',
    },
    update: {},
  })
  await prisma.recordEvent.create({
    data: {
      globalRecordId: params.globalRecordId,
      pipelineRunId: params.runId,
      stepId: params.stepId,
      userId: params.userId,
      eventType: 'MIGRATED',
      metadata: { script: 'migrate-legacy-records' },
    },
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄  Migrace legacy záznamů do GlobalRecord systému…\n')

  // Find all MS + PI steps with zero PipelineRecordRefs (skip steps already migrated)
  const legacySteps = (await prisma.pipelineStep.findMany({
    where: {
      stepType: { in: ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION'] },
      recordRefs: { none: {} },
    },
    include: {
      pipelineRun: { select: { id: true, authorId: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })).filter(s => s.outputData !== null)

  if (legacySteps.length === 0) {
    console.log('✅  Žádné legacy kroky k migraci.')
    return
  }

  console.log(`Nalezeno ${legacySteps.length} legacy kroků k migraci.\n`)

  let totalCreated = 0
  let totalLinked = 0
  let totalSkipped = 0

  for (const step of legacySteps) {
    const userId = step.pipelineRun.authorId
    const runId = step.pipelineRun.id
    const label = `${step.pipelineRun.name} · ${step.stepType} · ${step.createdAt.toLocaleDateString('cs-CZ')}`

    console.log(`  ↳ ${label}`)

    const inputSource = await prisma.inputSource.create({
      data: {
        type: 'MINI_DEEP_RESEARCH',
        pipelineRunId: runId,
        stepId: step.id,
        label: `Migrace – ${label}`,
        createdBy: userId,
        metadata: { migrated: true, originalCreatedAt: step.createdAt.toISOString() },
      },
    })

    // ── MARKET_SCANNING ────────────────────────────────────────────────────────
    if (step.stepType === 'MARKET_SCANNING') {
      const items = Array.isArray(step.outputData)
        ? (step.outputData as Record<string, unknown>[])
        : []

      let stepCreated = 0; let stepLinked = 0; let stepSkipped = 0

      for (const item of items) {
        const name = String(item.name ?? item.nazev ?? item.itemName ?? '').trim()
        if (!name) { stepSkipped++; continue }

        const url = String(item.url ?? item.website ?? item.web ?? '') || undefined
        const result = await upsertGlobalRecord({
          type: 'COMPETITION',
          name,
          payload: { ...item, url },
          userId,
        })
        if (!result) { stepSkipped++; continue }

        await linkRef({
          runId, stepId: step.id,
          globalRecordId: result.record.id,
          inputSourceId: inputSource.id,
          userId,
        })

        if (result.created) stepCreated++; else stepLinked++
      }

      console.log(`     MARKET_SCANNING: +${stepCreated} nových, ${stepLinked} propojených, ${stepSkipped} přeskočeno`)
      totalCreated += stepCreated; totalLinked += stepLinked; totalSkipped += stepSkipped
    }

    // ── PARTNER_IDENTIFICATION ─────────────────────────────────────────────────
    if (step.stepType === 'PARTNER_IDENTIFICATION') {
      const piData = step.outputData as { items?: unknown[] } | null
      const piItems = piData?.items ?? []
      const seenPartnerIds = new Set<string>()

      let stepCreated = 0; let stepLinked = 0; let stepSkipped = 0

      for (const piItem of piItems as Array<{ itemName?: string; partners?: Array<{ partnerId: string; name: string }> }>) {
        for (const partner of piItem.partners ?? []) {
          if (!partner.name?.trim() || seenPartnerIds.has(partner.partnerId)) {
            stepSkipped++; continue
          }
          seenPartnerIds.add(partner.partnerId)

          // Enrich from the Partner table
          const dbPartner = await prisma.partner.findUnique({
            where: { id: partner.partnerId },
            select: { name: true, website: true, description: true, type: true, rawData: true },
          })

          const name = dbPartner?.name ?? partner.name
          const result = await upsertGlobalRecord({
            type: 'PARTNER',
            name,
            payload: {
              name,
              website: dbPartner?.website ?? null,
              description: dbPartner?.description ?? null,
              type: dbPartner?.type ?? null,
              partnerId: partner.partnerId,
              ...((dbPartner?.rawData ?? {}) as Record<string, unknown>),
            },
            userId,
          })
          if (!result) { stepSkipped++; continue }

          await linkRef({
            runId, stepId: step.id,
            globalRecordId: result.record.id,
            inputSourceId: inputSource.id,
            userId,
          })

          if (result.created) stepCreated++; else stepLinked++
        }
      }

      console.log(`     PARTNER_IDENTIFICATION: +${stepCreated} nových, ${stepLinked} propojených, ${stepSkipped} přeskočeno`)
      totalCreated += stepCreated; totalLinked += stepLinked; totalSkipped += stepSkipped
    }
  }

  console.log(`
✅  Migrace dokončena:
    ${totalCreated} nových GlobalRecord záznamů vytvořeno
    ${totalLinked} existujících GlobalRecord záznamů propojeno
    ${totalSkipped} položek přeskočeno (prázdný název apod.)

Všechny záznamy mají stav UNCERTAIN — otevřete graf a otagujte je jako Relevantní / Irelevantní.
`)
}

main()
  .catch((err) => { console.error('❌ Chyba:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
