/**
 * Import Tour de App content files from prisma/tda-content/ into the database.
 *
 * Run with: bun prisma/import-tda-content.ts
 *
 * Imports:
 * - DATA01.txt → GlobalRecord (type: COMPETITION)
 * - MARKET.txt → SystemPrompt (stepType: MARKET_SCANNING)
 * - Tour de App*.txt → ContextPart (selling points / knowledge base)
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join, basename } from 'path'

const prisma = new PrismaClient()

const TDA_DIR = join(import.meta.dir, 'tda-content')

async function main() {
  // Get or create system user
  const systemUser = await prisma.user.upsert({
    where: { googleId: 'system' },
    update: {},
    create: {
      googleId: 'system',
      email: 'system@coldmailer.internal',
      name: 'System',
    },
  })

  console.log('System user:', systemUser.id)
  console.log('\n--- Importing TDA Content ---\n')

  const tdaGroup = await prisma.group.findUnique({ where: { slug: 'tda' } })
  if (!tdaGroup) throw new Error('Group "Tour de App" (slug: tda) does not exist. Run the seed first.')

  // ── 1. Import DATA01.txt as GlobalRecord (COMPETITION) ─────────────────────
  await importCompetitions(systemUser.id)

  // ── 2. Import MARKET.txt as SystemPrompt ──────────────────────────────────
  await importMarketPrompt(systemUser.id)

  // ── 3. Import Tour de App content files as ContextPart ──────────────────────
  await importContextParts(systemUser.id, tdaGroup.id)

  console.log('\n✅ Import completed!')
}

async function importCompetitions(userId: string) {
  const filePath = join(TDA_DIR, 'DATA01.txt')
  const content = readFileSync(filePath, 'utf-8')
  const data = JSON.parse(content) as { competitions: Array<Record<string, unknown>> }

  if (!Array.isArray(data.competitions)) {
    console.error('Invalid DATA01.txt format: expected { competitions: [...] }')
    return
  }

  console.log(`Found ${data.competitions.length} competitions in DATA01.txt`)

  let created = 0
  let existing = 0

  for (const item of data.competitions) {
    const name = String(item.name ?? '').trim()
    if (!name) {
      console.log('  ⚠ Skipping competition with empty name')
      continue
    }

    const normalizedName = normalizeName(name)

    // Check if already exists
    const dup = await prisma.globalRecord.findFirst({
      where: { type: 'COMPETITION', normalizedName },
    })

    if (dup) {
      existing++
      console.log(`  ↻ Exists: ${name}`)
      continue
    }

    await prisma.globalRecord.create({
      data: {
        type: 'COMPETITION',
        canonicalName: name,
        normalizedName,
        payload: item,
        relevanceStatus: 'UNCERTAIN',
        createdBy: userId,
      },
    })

    created++
    console.log(`  ✓ Created: ${name}`)
  }

  console.log(`Competitions: ${created} created, ${existing} already existed\n`)
}

async function importMarketPrompt(userId: string) {
  const filePath = join(TDA_DIR, 'MARKET.txt')
  const content = readFileSync(filePath, 'utf-8').trim()

  const existing = await prisma.systemPrompt.findFirst({
    where: { name: 'TDA Market Scanner', isSystem: true },
  })

  if (existing) {
    await prisma.systemPrompt.update({
      where: { id: existing.id },
      data: { content },
    })
    console.log('  ↻ Updated: TDA Market Scanner\n')
  } else {
    await prisma.systemPrompt.create({
      data: {
        name: 'TDA Market Scanner',
        content,
        stepType: 'MARKET_SCANNING',
        authorId: userId,
        isSystem: true,
      },
    })
    console.log('  ✓ Created: TDA Market Scanner\n')
  }
}

async function importContextParts(userId: string, groupId: string) {
  const contentFiles = [
    'Tour de App - Mise, cílová skupina a filosofie soutěže.txt',
    'Tour de App - Struktura soutěže.txt',
    'Tour de App - Technologie, dovednosti a charakter zadání.txt',
  ]

  for (const filename of contentFiles) {
    const filePath = join(TDA_DIR, filename)
    const content = readFileSync(filePath, 'utf-8').trim()
    const name = `TDA: ${filename.replace('Tour de App - ', '').replace('.txt', '')}`

    const existing = await prisma.contextPart.findFirst({
      where: { name, authorId: userId },
    })

    if (existing) {
      await prisma.contextPart.update({
        where: { id: existing.id },
        data: { content, groupId, projectId: null },
      })
      console.log(`  ↻ Updated: ${name}`)
    } else {
      await prisma.contextPart.create({
        data: {
          name,
          content,
          authorId: userId,
          groupId,
        },
      })
      console.log(`  ✓ Created: ${name}`)
    }
  }
  console.log('')
}

// ── Name normalization (same as migrate-legacy-records.ts) ──────────────────

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

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
