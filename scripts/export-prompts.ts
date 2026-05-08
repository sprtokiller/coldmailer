// Usage: bun scripts/export-prompts.ts [--output path/to/file.json]
//
// Exports all isSystem=true SystemPrompt records from the database to a JSON
// file. Use this to inspect the live DB state before updating config/pipeline.ts.

import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx !== -1 && args[outputIdx + 1]
    ? args[outputIdx + 1]
    : join(process.cwd(), 'scripts', 'exported-prompts.json')

  const prompts = await prisma.systemPrompt.findMany({
    where: { isSystem: true },
    orderBy: [{ stepType: 'asc' }, { createdAt: 'asc' }],
    select: {
      id:        true,
      name:      true,
      stepType:  true,
      content:   true,
      isSystem:  true,
      createdAt: true,
      author: { select: { id: true, email: true, name: true } },
    },
  })

  writeFileSync(outputPath, JSON.stringify(prompts, null, 2), 'utf8')

  console.log(`\nExported ${prompts.length} system prompt(s) → ${outputPath}\n`)
  for (const p of prompts) {
    console.log(`  [${p.stepType}]  "${p.name}"  (${p.content.length} chars)`)
  }

  // Warn about step types present in DB but missing from config
  const configPath = join(process.cwd(), 'config', 'pipeline.ts')
  const configSource = await Bun.file(configPath).text()
  for (const p of prompts) {
    if (p.stepType && !configSource.includes(`${p.stepType}:`)) {
      console.warn(`\n⚠  Step type "${p.stepType}" is in DB but not found in STEP_SYSTEM_PROMPTS (config/pipeline.ts)`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
