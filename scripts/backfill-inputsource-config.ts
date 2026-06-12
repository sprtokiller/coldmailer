/**
 * One-time backfill: populates InputSource.metadata.config for MARKET_SCANNING
 * MINI_DEEP_RESEARCH sources created before config snapshotting was introduced.
 *
 * Config is reconstructed from the linked PipelineStep (systemPromptId,
 * contextPartIds, inputData). manualContext was never persisted → ''.
 * AI_IMPORT sources cannot be backfilled — the raw input text was not stored.
 *
 * Run with:  bun scripts/backfill-inputsource-config.ts
 *
 * Safe to re-run — skips sources that already have metadata.config.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sources = await prisma.inputSource.findMany({
    where: { type: 'MINI_DEEP_RESEARCH' },
    include: { step: { select: { stepType: true, systemPromptId: true, contextPartIds: true, inputData: true } } },
  })

  let updated = 0
  let skippedHasConfig = 0
  let skippedNoStep = 0
  let skippedNotMs = 0

  for (const src of sources) {
    const existing = src.metadata as { config?: unknown } | null
    if (existing?.config) { skippedHasConfig++; continue }
    if (!src.step) { skippedNoStep++; continue }
    if (src.step.stepType !== 'MARKET_SCANNING') { skippedNotMs++; continue }

    await prisma.inputSource.update({
      where: { id: src.id },
      data: {
        metadata: {
          ...(existing ?? {}),
          config: {
            systemPromptId: src.step.systemPromptId ?? null,
            contextPartIds: src.step.contextPartIds ?? [],
            manualContext: '',
            inputData: (src.step.inputData ?? {}) as object,
          },
        },
      },
    })
    updated++
    console.log(`✓ ${src.id}  ${src.label}`)
  }

  console.log(`\nDone. Updated: ${updated}, already had config: ${skippedHasConfig}, no step: ${skippedNoStep}, non-MS step: ${skippedNotMs}`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
