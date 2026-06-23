import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export const PROJECT_PERMISSIONS = [
  'project.interactions.view_all',
  'project.interactions.edit_all',
] as const

export type ProjectPermissionKey = typeof PROJECT_PERMISSIONS[number]

export const PROJECT_PERMISSION_LABELS: Record<ProjectPermissionKey, string> = {
  'project.interactions.view_all': 'Vidí všechna jednání v projektu',
  'project.interactions.edit_all': 'Edituje všechna jednání v projektu',
}

export const DEFAULT_PROJECT_ROLES = [
  {
    name: 'Vedoucí obchodu',
    permissions: ['project.interactions.view_all', 'project.interactions.edit_all'] as string[],
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
      update: {},
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
    select: { isSuperAdmin: true },
  })

  if (user?.isSuperAdmin) {
    return { canViewAll: true, canEditAll: true, isAdmin: true }
  }

  const perms = await getProjectPermissions(userId, projectId)
  return {
    canViewAll: perms.includes('project.interactions.view_all'),
    canEditAll: perms.includes('project.interactions.edit_all'),
    isAdmin: false,
  }
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
    throw createError({ statusCode: 404, statusMessage: 'Jednání nebylo nalezeno.' })
  }

  const access = await getInteractionAccess(session.id, interaction.projectId)
  const isAssignee = interaction.assignees.some(a => a.userId === session.id)
  const isCreator = interaction.createdBy === session.id

  if (mode === 'view') {
    if (!access.canViewAll && !isAssignee && !isCreator && !access.isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'K tomuto jednání nemáte přístup.' })
    }
  } else {
    if (!access.canEditAll && !isAssignee && !isCreator && !access.isAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Nemáte oprávnění editovat toto jednání.' })
    }
  }

  return { session, interaction, access, isAssignee, isCreator }
}
