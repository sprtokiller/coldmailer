import { PrismaClient } from '@prisma/client'
import { DEFAULT_PROMPT_NAMES } from '../config/pipeline'
import { readFileSync, readdirSync } from 'fs'
import { join, basename, extname } from 'path'

const prisma = new PrismaClient()

const PROMPTS_DIR = join(import.meta.dir, 'system-prompts')

function loadPromptsFromDisk(): Record<string, string> {
  const files = readdirSync(PROMPTS_DIR).filter(f => extname(f) === '.txt')
  return Object.fromEntries(
    files.map(f => [basename(f, '.txt'), readFileSync(join(PROMPTS_DIR, f), 'utf-8').trim()])
  )
}

async function main() {
  const systemUser = await prisma.user.upsert({
    where: { googleId: 'system' },
    update: {},
    create: {
      googleId: 'system',
      email: 'system@coldmailer.internal',
      name: 'System',
    },
  })

  console.log(`System user: ${systemUser.id}`)

  const prompts = loadPromptsFromDisk()
  console.log(`Loaded ${Object.keys(prompts).length} prompts from prisma/system-prompts/`)

  for (const [stepType, content] of Object.entries(prompts)) {
    const name = DEFAULT_PROMPT_NAMES[stepType] ?? 'Výchozí'
    const existing = await prisma.systemPrompt.findFirst({
      where: { stepType: stepType as never, isSystem: true, authorId: systemUser.id },
    })

    if (existing) {
      await prisma.systemPrompt.update({
        where: { id: existing.id },
        data: { name, content, isSystem: true },
      })
      console.log(`  ↻ Updated: ${stepType} → "${name}"`)
    } else {
      await prisma.systemPrompt.create({
        data: {
          name,
          content,
          stepType: stepType as never,
          authorId: systemUser.id,
          isSystem: true,
        },
      })
      console.log(`  ✓ Created: ${stepType} → "${name}"`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
