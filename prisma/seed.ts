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

const GROUPS = [
  { name: 'Tour de App', slug: 'tda', color: '#EF8A17' },
  { name: 'Prezentiáda', slug: 'ppt', color: '#A6CE39' },
  { name: 'pIšQworky',   slug: 'xo',  color: '#e31837' },
]

async function seedGroups() {
  for (const g of GROUPS) {
    await prisma.group.upsert({
      where: { slug: g.slug },
      create: g,
      update: { name: g.name, color: g.color },
    })
    console.log(`  ✓ Group: ${g.name}`)
  }

  const tdaGroup = await prisma.group.findUnique({ where: { slug: 'tda' } })
  if (!tdaGroup) return

  const tda27 = await prisma.project.upsert({
    where: { slug: 'tda27' },
    create: { name: 'TdA27', slug: 'tda27', groupId: tdaGroup.id },
    update: { name: 'TdA27', groupId: tdaGroup.id },
  })
  console.log('  ✓ Project: Tour de App → TdA27')

  const realUsers = await prisma.user.findMany({
    where: { googleId: { not: 'system' } },
  })
  for (const u of realUsers) {
    await prisma.userProject.upsert({
      where: { userId_projectId: { userId: u.id, projectId: tda27.id } },
      create: { userId: u.id, projectId: tda27.id },
      update: {},
    })
    console.log(`  ✓ User ${u.email} → Tour de App / TdA27`)
  }

  const tables = [
    { model: 'systemPrompt', extra: { isSystem: false } },
    { model: 'contextPart', extra: {} },
    { model: 'sellingPoint', extra: {} },
    { model: 'emailDraft', extra: {} },
  ] as const

  for (const t of tables) {
    const result = await (prisma[t.model] as any).updateMany({
      where: { groupId: null, projectId: null, ...t.extra },
      data: { groupId: tdaGroup.id, projectId: null },
    })
    if (result.count > 0) console.log(`  ✓ Migrated ${result.count} ${t.model} → Tour de App`)
  }
}

const DEFAULT_INDUSTRY_TAGS = [
  'IT a technologie',
  'Kybernetická bezpečnost',
  'EdTech a vzdělávací technologie',
  'Vzdělávání a akademie',
  'Veřejná správa',
  'Průmysl a výroba',
  'Energetika a utility',
  'Komunita a neziskový sektor',
  'Kultura a paměťové instituce',
  'Média a komunikace',
  'Služby a poradenství',
  'Finance a investice',
  'Zábava a volný čas',
]

async function seedTags() {
  console.log('Seeding industry tags…')
  const key = 'tags.partnerIndustry'
  const existing = await prisma.systemConfig.findUnique({ where: { key } })
  const currentTags: string[] = Array.isArray(existing?.value) ? existing!.value as string[] : []
  const merged = [...new Set([...currentTags, ...DEFAULT_INDUSTRY_TAGS])].sort((a, b) => a.localeCompare(b, 'cs'))
  await prisma.systemConfig.upsert({
    where: { key },
    create: { key, value: merged as never },
    update: { value: merged as never },
  })
  console.log(`  ✓ ${merged.length} tags (${merged.length - currentTags.length} new)`)
}

main()
  .then(() => seedRoles())
  .then(() => seedGroups())
  .then(() => seedTags())
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
