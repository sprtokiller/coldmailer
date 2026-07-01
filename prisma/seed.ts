import { PrismaClient } from '@prisma/client'
import { DEFAULT_PROMPT_NAMES, STEP_OUTPUT_SCHEMAS } from '../config/pipeline'
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

  const adminEmails = (process.env.NUXT_ADMIN_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { isAdmin: true },
      create: { googleId: `seed:${email}`, email, name: email.split('@')[0], isAdmin: true },
    })
    console.log(`  ✓ Admin user: ${email}`)
  }

  const prompts = loadPromptsFromDisk()
  console.log(`Loaded ${Object.keys(prompts).length} prompts from prisma/system-prompts/`)

  for (const [stepType, content] of Object.entries(prompts)) {
    const name = DEFAULT_PROMPT_NAMES[stepType] ?? 'Výchozí'
    const outputSchema = STEP_OUTPUT_SCHEMAS[stepType] ?? null
    const existing = await prisma.systemPrompt.findFirst({
      where: { stepType: stepType as never, isSystem: true, authorId: systemUser.id },
    })

    if (existing) {
      await prisma.systemPrompt.update({
        where: { id: existing.id },
        data: { name, content, isSystem: true, outputSchema: outputSchema as any },
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
          outputSchema: outputSchema as any,
        },
      })
      console.log(`  ✓ Created: ${stepType} → "${name}"`)
    }
  }
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

  const { ensureDefaultProjectRoles } = await import('../server/utils/projectPermissions')
  await ensureDefaultProjectRoles(tda27.id)

  const defaultRole = await prisma.projectRole.findFirst({
    where: { projectId: tda27.id, name: 'Obchodní tým' },
  })

  if (defaultRole) {
    const realUsers = await prisma.user.findMany({
      where: { googleId: { not: 'system' } },
    })
    for (const u of realUsers) {
      await prisma.userProjectRole.upsert({
        where: { userId_projectRoleId: { userId: u.id, projectRoleId: defaultRole.id } },
        create: { userId: u.id, projectRoleId: defaultRole.id },
        update: {},
      })
      console.log(`  ✓ User ${u.email} → Tour de App / TdA27 (Obchodní tým)`)
    }
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

const DEFAULT_PROJECT_ROLES = [
  {
    name: 'Vedení obchodu',
    permissions: ['project.interactions.view_all', 'project.interactions.edit_all'],
    isSystem: true,
  },
  {
    name: 'Obchodní tým',
    permissions: ['project.interactions.view_all'],
    isSystem: true,
  },
]

async function seedProjectRoles() {
  console.log('Seeding project roles…')
  const projects = await prisma.project.findMany()
  for (const project of projects) {
    for (const role of DEFAULT_PROJECT_ROLES) {
      await prisma.projectRole.upsert({
        where: { projectId_name: { projectId: project.id, name: role.name } },
        create: { projectId: project.id, name: role.name, permissions: role.permissions, isSystem: role.isSystem },
        update: {},
      })
    }
    console.log(`  ✓ ProjectRoles for: ${project.name}`)
  }
}

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

const TDA_CONTENT_DIR = join(import.meta.dir, 'tda-content')

function readTdaFile(filename: string) {
  return readFileSync(join(TDA_CONTENT_DIR, filename), 'utf-8').trim()
}

async function seedTdaContent() {
  const kriz =
    (await prisma.user.findFirst({ where: { isAdmin: true, googleId: { not: 'system' } } })) ??
    (await prisma.user.findUnique({ where: { googleId: 'system' } }))
  if (!kriz) { console.log('  ⚠ System user not found, skipping TdA content'); return }

  const tdaGroup = await prisma.group.findUnique({ where: { slug: 'tda' } })
  if (!tdaGroup) { console.log('  ⚠ TdA group not found, skipping TdA content'); return }

  // ── SystemPrompt: MARKET_SCANNING ───────────────────────────────────────
  const msContent = readTdaFile('Tour de App - MARKET_SCANNING.txt')
  await prisma.systemPrompt.upsert({
    where: { id: 'tda-market-scanning-prompt' },
    create: {
      id: 'tda-market-scanning-prompt',
      name: 'Tour de App',
      content: msContent,
      stepType: 'MARKET_SCANNING',
      isSystem: false,
      authorId: kriz.id,
      groupId: tdaGroup.id,
      outputSchema: STEP_OUTPUT_SCHEMAS.MARKET_SCANNING as any,
    },
    update: { content: msContent, outputSchema: STEP_OUTPUT_SCHEMAS.MARKET_SCANNING as any },
  })
  console.log('  ✓ SystemPrompt: MARKET_SCANNING (TdA)')

  // ── EmailDraft ────────────────────────────────────────────────────────────
  const emailRaw = readTdaFile('Tour de App - EMAIL_TEMPLATE.txt')
  const [subjectLine, , ...bodyLines] = emailRaw.split('\n')
  const emailSubject = subjectLine.replace(/^Subject:\s*/i, '').trim()
  const emailBody = bodyLines.join('\n').trim()
  await prisma.emailDraft.upsert({
    where: { id: 'tda-email-template' },
    create: {
      id: 'tda-email-template',
      name: 'Tour de App – základní šablona',
      subject: emailSubject,
      body: emailBody,
      authorId: kriz.id,
      groupId: tdaGroup.id,
    },
    update: { subject: emailSubject, body: emailBody },
  })
  console.log('  ✓ EmailDraft: Tour de App – základní šablona')

  // ── SellingPoint ──────────────────────────────────────────────────────────
  const spContent = readTdaFile('Tour de App - Arguments.txt')
  await prisma.sellingPoint.upsert({
    where: { id: 'tda-selling-points' },
    create: {
      id: 'tda-selling-points',
      name: 'Tour de App – prodejní argumenty',
      content: spContent,
      authorId: kriz.id,
      groupId: tdaGroup.id,
    },
    update: { content: spContent },
  })
  console.log('  ✓ SellingPoint: Tour de App – prodejní argumenty')

  // ── ContextParts ──────────────────────────────────────────────────────────
  const contextFiles = [
    { id: 'tda-context-mise',        file: 'Tour de App - Mise, cílová skupina a filosofie soutěže.txt',    name: 'TdA – Mise, cílová skupina a filosofie' },
    { id: 'tda-context-struktura',   file: 'Tour de App - Struktura soutěže.txt',                           name: 'TdA – Struktura soutěže' },
    { id: 'tda-context-technologie', file: 'Tour de App - Technologie, dovednosti a charakter zadání.txt',  name: 'TdA – Technologie, dovednosti a charakter zadání' },
  ]
  const ALL_STEP_KEYS = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION']
  for (const cp of contextFiles) {
    const content = readTdaFile(cp.file)
    await prisma.contextPart.upsert({
      where: { id: cp.id },
      create: { id: cp.id, name: cp.name, content, authorId: kriz.id, groupId: tdaGroup.id, stepKeys: ALL_STEP_KEYS },
      update: { content, stepKeys: ALL_STEP_KEYS },
    })
    console.log(`  ✓ ContextPart: ${cp.name}`)
  }

  // ── Signature: Tour de App (šablona pro typ projektu TdA) ───────────────
  const sigContent = readTdaFile('Tour de App - Podpis Template.txt')
  await prisma.signature.upsert({
    where: { id: 'tda-signature-template' },
    create: {
      id: 'tda-signature-template',
      name: 'Tour de App',
      content: sigContent,
      isTemplate: true,
      groupId: tdaGroup.id,
      authorId: kriz.id,
    },
    update: { content: sigContent, isTemplate: true, groupId: tdaGroup.id },
  })
  console.log('  ✓ Signature: Tour de App (šablona)')
}

main()
  .then(() => seedGroups())
  .then(() => seedProjectRoles())
  .then(() => seedTags())
  .then(() => seedTdaContent())
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
