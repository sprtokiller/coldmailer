import { PrismaClient } from '@prisma/client'
import { DEFAULT_PROMPT_NAMES } from '../config/pipeline'
import { readFileSync, readdirSync } from 'fs'
import { join, basename, extname } from 'path'

const prisma = new PrismaClient()

const ALL_PERMISSIONS = [
  'prompts.system.read', 'prompts.system.edit',
  'prompts.own.read', 'prompts.own.edit',
  'prompts.others.read', 'prompts.others.edit',
  'context.own.read', 'context.own.edit',
  'context.others.read', 'context.others.edit',
  'selling.own.read', 'selling.own.edit',
  'selling.others.read', 'selling.others.edit',
  'drafts.own.read', 'drafts.own.edit',
  'drafts.others.read', 'drafts.others.edit',
  'pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail',
  'admin.roles',
]

const DEFAULT_PERMISSIONS = [
  'prompts.system.read',
  'prompts.own.read', 'prompts.own.edit',
  'prompts.others.read',
  'context.own.read', 'context.own.edit',
  'context.others.read',
  'selling.own.read', 'selling.own.edit',
  'selling.others.read',
  'drafts.own.read', 'drafts.own.edit',
  'drafts.others.read',
  'pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail',
]

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

async function seedRoles() {
  await prisma.role.upsert({
    where: { id: 'role-administrator' },
    create: {
      id: 'role-administrator',
      name: 'Administrátor',
      description: 'Plný přístup ke všem funkcím kromě správy systému.',
      color: '#6366f1',
      isSystem: true,
      permissions: ALL_PERMISSIONS,
    },
    update: { permissions: ALL_PERMISSIONS },
  })
  console.log('  ✓ Role: Administrátor')

  await prisma.role.upsert({
    where: { id: 'role-user' },
    create: {
      id: 'role-user',
      name: 'Běžný uživatel',
      description: 'Standardní přístup ke knihovně a pipeline.',
      color: '#10b981',
      isSystem: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    update: { permissions: DEFAULT_PERMISSIONS },
  })
  console.log('  ✓ Role: Běžný uživatel')
}

main()
  .then(() => seedRoles())
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
