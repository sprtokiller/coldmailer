import { PrismaClient } from '@prisma/client'
import { STEP_SYSTEM_PROMPTS, DEFAULT_PROMPT_NAMES } from '../server/utils/default-prompts'

const prisma = new PrismaClient()

async function main() {
  // Upsert a system user that owns the default prompts.
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

  // Seed one default prompt per step type — idempotent via name + authorId check.
  for (const [stepType, content] of Object.entries(STEP_SYSTEM_PROMPTS)) {
    const name = DEFAULT_PROMPT_NAMES[stepType] ?? `Default – ${stepType}`
    const existing = await prisma.systemPrompt.findFirst({
      where: { name, authorId: systemUser.id },
    })

    if (existing) {
      // Keep content in sync with source code.
      await prisma.systemPrompt.update({
        where: { id: existing.id },
        data: { content },
      })
      console.log(`  ↻ Updated: ${name}`)
    } else {
      await prisma.systemPrompt.create({
        data: {
          name,
          content,
          stepType: stepType as never,
          authorId: systemUser.id,
        },
      })
      console.log(`  ✓ Created: ${name}`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
