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
  'prompts.own.delete',
  // Other users' prompts
  'prompts.others.read',
  'prompts.others.edit',
  'prompts.others.delete',
  // Context parts
  'context.own.read',
  'context.own.edit',
  'context.own.delete',
  'context.others.read',
  'context.others.edit',
  'context.others.delete',
  // Selling points
  'selling.own.read',
  'selling.own.edit',
  'selling.own.delete',
  'selling.others.read',
  'selling.others.edit',
  'selling.others.delete',
  // Email drafts
  'drafts.own.read',
  'drafts.own.edit',
  'drafts.own.delete',
  'drafts.others.read',
  'drafts.others.edit',
  'drafts.others.delete',
  // Signatures
  'signatures.own.edit',
  'signatures.system.edit',
  // Pipeline features
  'pipeline.serpapi',
  'pipeline.deep_research',
  'pipeline.claude',
  'pipeline.gmail',
  // Partners
  'partners.create',
  'partners.edit',
  // Administration
  'admin.roles',
] as const

export type PermissionKey = typeof ALL_PERMISSIONS[number]

export const DEFAULT_PERMISSIONS: PermissionKey[] = [
  'prompts.system.read',
  'prompts.own.read', 'prompts.own.edit', 'prompts.own.delete',
  'prompts.others.read',
  'context.own.read', 'context.own.edit', 'context.own.delete',
  'context.others.read',
  'selling.own.read', 'selling.own.edit', 'selling.own.delete',
  'selling.others.read',
  'drafts.own.read', 'drafts.own.edit', 'drafts.own.delete',
  'drafts.others.read',
  'signatures.own.edit',
  'pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail',
  'partners.create', 'partners.edit',
]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'prompts.system.read': 'Číst systémové prompty',
  'prompts.system.edit': 'Upravovat systémové prompty',
  'prompts.own.read': 'Číst vlastní prompty',
  'prompts.own.edit': 'Vytvářet / editovat vlastní prompty',
  'prompts.own.delete': 'Mazat vlastní prompty',
  'prompts.others.read': 'Číst cizí prompty',
  'prompts.others.edit': 'Upravovat cizí prompty',
  'prompts.others.delete': 'Mazat cizí prompty',
  'context.own.read': 'Číst vlastní kontextové části',
  'context.own.edit': 'Vytvářet / editovat vlastní kontextové části',
  'context.own.delete': 'Mazat vlastní kontextové části',
  'context.others.read': 'Číst cizí kontextové části',
  'context.others.edit': 'Upravovat cizí kontextové části',
  'context.others.delete': 'Mazat cizí kontextové části',
  'selling.own.read': 'Číst vlastní prodejní argumenty',
  'selling.own.edit': 'Vytvářet / editovat vlastní prodejní argumenty',
  'selling.own.delete': 'Mazat vlastní prodejní argumenty',
  'selling.others.read': 'Číst cizí prodejní argumenty',
  'selling.others.edit': 'Upravovat cizí prodejní argumenty',
  'selling.others.delete': 'Mazat cizí prodejní argumenty',
  'drafts.own.read': 'Číst vlastní e-mailové šablony',
  'drafts.own.edit': 'Vytvářet / editovat vlastní e-mailové šablony',
  'drafts.own.delete': 'Mazat vlastní e-mailové šablony',
  'drafts.others.read': 'Číst cizí e-mailové šablony',
  'drafts.others.edit': 'Upravovat cizí e-mailové šablony',
  'drafts.others.delete': 'Mazat cizí e-mailové šablony',
  'signatures.own.edit': 'Vytvářet / editovat vlastní podpisy',
  'signatures.system.edit': 'Spravovat podpisové šablony (systémové)',
  'pipeline.serpapi': 'Spouštět Partner Identification (SerpAPI)',
  'pipeline.deep_research': 'Spouštět deep-research kroky (o4-mini)',
  'pipeline.claude': 'Spouštět Claude kroky (Value Alignment, Outreach Preparation)',
  'pipeline.gmail': 'Vytvářet Gmail drafty (Outreach Execution)',
  'partners.create': 'Vytvářet partnery ručně',
  'partners.edit': 'Upravovat profily partnerů',
  'admin.roles': 'Správa rolí a oprávnění uživatelů',
}

export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: 'Systémové prompty', keys: ['prompts.system.read', 'prompts.system.edit'] },
  { label: 'Vlastní prompty', keys: ['prompts.own.read', 'prompts.own.edit', 'prompts.own.delete'] },
  { label: 'Cizí prompty', keys: ['prompts.others.read', 'prompts.others.edit', 'prompts.others.delete'] },
  { label: 'Kontextové části', keys: ['context.own.read', 'context.own.edit', 'context.own.delete', 'context.others.read', 'context.others.edit', 'context.others.delete'] },
  { label: 'Prodejní argumenty', keys: ['selling.own.read', 'selling.own.edit', 'selling.own.delete', 'selling.others.read', 'selling.others.edit', 'selling.others.delete'] },
  { label: 'Mailové šablony', keys: ['drafts.own.read', 'drafts.own.edit', 'drafts.own.delete', 'drafts.others.read', 'drafts.others.edit', 'drafts.others.delete'] },
  { label: 'Podpisy', keys: ['signatures.own.edit', 'signatures.system.edit'] },
  { label: 'Pipeline', keys: ['pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail'] },
  { label: 'Partneři', keys: ['partners.create', 'partners.edit'] },
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

type ScopedResource = {
  projectId?: string | null
  groupId?: string | null
}

export async function getUserScopeAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      groups: { select: { groupId: true } },
      projects: {
        select: {
          projectId: true,
          project: { select: { groupId: true } },
        },
      },
    },
  })

  const projectIds = new Set(user?.projects.map(m => m.projectId) ?? [])
  const directGroupIds = new Set(user?.groups.map(m => m.groupId) ?? [])
  const groupIds = new Set(directGroupIds)
  for (const membership of user?.projects ?? []) groupIds.add(membership.project.groupId)

  return {
    isSuperAdmin: user?.isSuperAdmin ?? false,
    projectIds: [...projectIds],
    directGroupIds: [...directGroupIds],
    groupIds: [...groupIds],
  }
}

export async function requireProjectAccess(
  event: H3Event,
  projectId: string,
  options: { directAssignment?: boolean } = {},
) {
  const session = await requireAuth(event)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { group: true },
  })
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Projekt nebyl nalezen.' })
  }

  const access = await getUserScopeAccess(session.id)
  const allowed = access.isSuperAdmin
    || access.projectIds.includes(projectId)
    || (!options.directAssignment && access.directGroupIds.includes(project.groupId))

  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'K tomuto projektu nemáte přístup.' })
  }

  return { session, project }
}

export async function requirePipelineAccess(event: H3Event, pipelineRunId: string) {
  await requireAuth(event)
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    select: { id: true, projectId: true },
  })
  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'Pipeline nebyla nalezena.' })
  }

  await requireProjectAccess(event, run.projectId)
  return run
}

export async function requireLibraryScopeAccess(event: H3Event, scope: ScopedResource) {
  const session = await requireAuth(event)
  const hasProject = Boolean(scope.projectId)
  const hasGroup = Boolean(scope.groupId)

  if (hasProject === hasGroup) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Vyberte právě jeden Projekt nebo Typ projektu.',
    })
  }

  if (scope.projectId) {
    return requireProjectAccess(event, scope.projectId)
  }

  const access = await getUserScopeAccess(session.id)
  if (!access.isSuperAdmin && !access.groupIds.includes(scope.groupId!)) {
    throw createError({ statusCode: 403, statusMessage: 'K tomuto typu projektu nemáte přístup.' })
  }

  const group = await prisma.group.findUnique({ where: { id: scope.groupId! } })
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Typ projektu nebyl nalezen.' })
  }

  return { session, group }
}

export async function requireResourceScopeAccess(event: H3Event, resource: ScopedResource) {
  if (!resource.projectId && !resource.groupId) {
    const session = await requireAuth(event)
    const access = await getUserScopeAccess(session.id)
    if (!access.isSuperAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'K této položce nemáte přístup.' })
    }
    return
  }
  await requireLibraryScopeAccess(event, resource)
}
