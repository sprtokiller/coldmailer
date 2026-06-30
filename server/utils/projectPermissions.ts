import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export const PROJECT_PERMISSIONS = [
  'project.pipeline.manage',
  'project.interactions.view_all',
  'project.interactions.edit_all',
] as const

export type ProjectPermissionKey = typeof PROJECT_PERMISSIONS[number]

export const PROJECT_PERMISSION_LABELS: Record<ProjectPermissionKey, string> = {
  'project.pipeline.manage': 'Spravuje pipeline (vytváření, spouštění kroků, import dat)',
  'project.interactions.view_all': 'Vidí všechna jednání v projektu',
  'project.interactions.edit_all': 'Edituje všechna jednání v projektu',
}

export const DEFAULT_PROJECT_ROLES = [
  {
    name: 'Vedení obchodu',
    permissions: ['project.pipeline.manage', 'project.interactions.view_all', 'project.interactions.edit_all'] as string[],
    isSystem: true,
  },
  {
    name: 'Obchodní tým',
    permissions: ['project.interactions.view_all'] as string[],
    isSystem: true,
  },
]

export async function ensureDefaultProjectRoles(projectId: string) {
  for (const role of DEFAULT_PROJECT_ROLES) {
    await prisma.projectRole.upsert({
      where: { projectId_name: { projectId, name: role.name } },
      create: { projectId, name: role.name, permissions: role.permissions, isSystem: role.isSystem },
      update: { permissions: role.permissions },
    })
  }
}

export async function getProjectPermissions(userId: string, projectId: string): Promise<string[]> {
  const assignments = await prisma.userProjectRole.findMany({
    where: { userId, projectRole: { projectId } },
    include: { projectRole: { select: { permissions: true } } },
  })
  return [...new Set(assignments.flatMap(a => a.projectRole.permissions))]
}

export async function getInteractionAccess(userId: string, projectId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })

  if (user?.isAdmin) {
    return { canViewAll: true, canEditAll: true, isAdmin: true }
  }

  const perms = await getProjectPermissions(userId, projectId)
  return {
    canViewAll: perms.includes('project.interactions.view_all'),
    canEditAll: perms.includes('project.interactions.edit_all'),
    isAdmin: false,
  }
}

export async function requirePipelineManage(event: H3Event, projectId: string) {
  const session = await requireAuth(event)
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { isAdmin: true } })
  if (user?.isAdmin) return session
  const perms = await getProjectPermissions(session.id, projectId)
  if (!perms.includes('project.pipeline.manage')) {
    throw createError({ statusCode: 403, message: 'Pro tuto akci potřebujete oprávnění vedení obchodu.' })
  }
  return session
}

export async function requireInteractionAccess(
  event: H3Event,
  interactionId: string,
  mode: 'view' | 'edit',
) {
  const session = await requireAuth(event)

  const interaction = await prisma.interaction.findUnique({
    where: { id: interactionId },
    include: {
      assignees: { select: { userId: true } },
    },
  })

  if (!interaction) {
    throw createError({ statusCode: 404, message: 'JednĂˇnĂ­ nebylo nalezeno.' })
  }

  const access = await getInteractionAccess(session.id, interaction.projectId)

  if (!access.isAdmin && !access.canViewAll && !access.canEditAll) {
    throw createError({ statusCode: 403, message: 'K tomuto projektu nemĂˇte pĹ™Ă­stup.' })
  }

  const isAssignee = interaction.assignees.some(a => a.userId === session.id)
  const isCreator = interaction.createdBy === session.id

  if (mode === 'view') {
    if (!access.canViewAll && !isAssignee && !isCreator && !access.isAdmin) {
      throw createError({ statusCode: 403, message: 'K tomuto jednĂˇnĂ­ nemĂˇte pĹ™Ă­stup.' })
    }
  } else {
    if (!access.canEditAll && !isAssignee && !isCreator && !access.isAdmin) {
      throw createError({ statusCode: 403, message: 'NemĂˇte oprĂˇvnÄ›nĂ­ editovat toto jednĂˇnĂ­.' })
    }
  }

  return { session, interaction, access, isAssignee, isCreator }
}

