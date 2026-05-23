import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export const ALL_PERMISSIONS = [
  // System prompts (isSystem: true prompts)
  'prompts.system.read',
  'prompts.system.edit',
  // Own prompts
  'prompts.own.read',
  'prompts.own.edit',
  // Other users' prompts
  'prompts.others.read',
  'prompts.others.edit',
  // Context parts
  'context.own.read',
  'context.own.edit',
  'context.others.read',
  'context.others.edit',
  // Selling points
  'selling.own.read',
  'selling.own.edit',
  'selling.others.read',
  'selling.others.edit',
  // Email drafts
  'drafts.own.read',
  'drafts.own.edit',
  'drafts.others.read',
  'drafts.others.edit',
  // Pipeline features
  'pipeline.serpapi',
  'pipeline.deep_research',
  'pipeline.claude',
  'pipeline.gmail',
  // Administration
  'admin.roles',
] as const

export type PermissionKey = typeof ALL_PERMISSIONS[number]

export const DEFAULT_PERMISSIONS: PermissionKey[] = [
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

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'prompts.system.read': 'Číst systémové prompty',
  'prompts.system.edit': 'Upravovat systémové prompty',
  'prompts.own.read': 'Číst vlastní prompty',
  'prompts.own.edit': 'Vytvářet / editovat vlastní prompty',
  'prompts.others.read': 'Číst cizí prompty',
  'prompts.others.edit': 'Upravovat cizí prompty',
  'context.own.read': 'Číst vlastní kontextové části',
  'context.own.edit': 'Vytvářet / editovat vlastní kontextové části',
  'context.others.read': 'Číst cizí kontextové části',
  'context.others.edit': 'Upravovat cizí kontextové části',
  'selling.own.read': 'Číst vlastní prodejní argumenty',
  'selling.own.edit': 'Vytvářet / editovat vlastní prodejní argumenty',
  'selling.others.read': 'Číst cizí prodejní argumenty',
  'selling.others.edit': 'Upravovat cizí prodejní argumenty',
  'drafts.own.read': 'Číst vlastní e-mailové šablony',
  'drafts.own.edit': 'Vytvářet / editovat vlastní e-mailové šablony',
  'drafts.others.read': 'Číst cizí e-mailové šablony',
  'drafts.others.edit': 'Upravovat cizí e-mailové šablony',
  'pipeline.serpapi': 'Spouštět Partner Identification (SerpAPI)',
  'pipeline.deep_research': 'Spouštět deep-research kroky (o4-mini)',
  'pipeline.claude': 'Spouštět Claude kroky (Value Alignment, Outreach Preparation)',
  'pipeline.gmail': 'Vytvářet Gmail drafty (Outreach Execution)',
  'admin.roles': 'Správa rolí a oprávnění uživatelů',
}

export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: 'Systémové prompty', keys: ['prompts.system.read', 'prompts.system.edit'] },
  { label: 'Vlastní prompty', keys: ['prompts.own.read', 'prompts.own.edit'] },
  { label: 'Cizí prompty', keys: ['prompts.others.read', 'prompts.others.edit'] },
  { label: 'Kontextové části', keys: ['context.own.read', 'context.own.edit', 'context.others.read', 'context.others.edit'] },
  { label: 'Prodejní argumenty', keys: ['selling.own.read', 'selling.own.edit', 'selling.others.read', 'selling.others.edit'] },
  { label: 'Mailové šablony', keys: ['drafts.own.read', 'drafts.own.edit', 'drafts.others.read', 'drafts.others.edit'] },
  { label: 'Pipeline', keys: ['pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail'] },
  { label: 'Správa', keys: ['admin.roles'] },
]

export async function getEffectivePermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } }, permOverrides: true },
  })
  if (!user) return []
  if (user.isSuperAdmin) return [...ALL_PERMISSIONS]

  const rolePerms = user.roles.length > 0
    ? [...new Set(user.roles.flatMap(ur => ur.role.permissions))]
    : [...DEFAULT_PERMISSIONS]

  const granted = new Set(rolePerms)

  for (const ov of user.permOverrides) {
    if (ov.granted) granted.add(ov.key)
    else granted.delete(ov.key)
  }

  return [...granted]
}

export async function requirePermission(event: H3Event, permission: PermissionKey) {
  const session = await requireAuth(event)
  const perms = await getEffectivePermissions(session.id)
  if (!perms.includes(permission)) {
    throw createError({ statusCode: 403, statusMessage: `Nemáte oprávnění: ${permission}` })
  }
  return session
}
