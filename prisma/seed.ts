import { PrismaClient } from '@prisma/client'
import { STEP_SYSTEM_PROMPTS, DEFAULT_PROMPT_NAMES } from '../config/pipeline'

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

  // Seed one default prompt per step type — idempotent via stepType + isSystem + authorId.
  for (const [stepType, content] of Object.entries(STEP_SYSTEM_PROMPTS)) {
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
