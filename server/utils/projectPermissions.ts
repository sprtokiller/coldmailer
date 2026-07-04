import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

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

// Returns true if user can create/edit interactions and update status for this partner.
// Allowed for: Admin, Vedení obchodu (canEditAll), the OutreachAssignment holder (oslovení),
// or a NegotiationAssignee (jednání) for this partner.
export async function canEditNegotiation(userId: string, projectId: string, globalRecordId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  if (user?.isAdmin) return true
  const perms = await getProjectPermissions(userId, projectId)
  if (perms.includes('project.interactions.edit_all')) return true
  const [outreachAssignment, negotiationAssignee] = await Promise.all([
    prisma.outreachAssignment.findFirst({
      where: { projectId, globalRecordId, assigneeId: userId },
      select: { id: true },
    }),
    prisma.negotiationAssignee.findFirst({
      where: { projectId, globalRecordId, userId },
      select: { id: true },
    }),
  ])
  return !!outreachAssignment || !!negotiationAssignee
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
    throw createError({ statusCode: 404, message: 'Jednání nebylo nalezeno.' })
  }

  const access = await getInteractionAccess(session.id, interaction.projectId)

  if (!access.isAdmin && !access.canViewAll) {
    throw createError({ statusCode: 403, message: 'K tomuto projektu nemáte přístup.' })
  }

  const isCreator = interaction.createdBy === session.id

  if (mode === 'edit' && !access.isAdmin && !access.canEditAll && !isCreator) {
    const canEdit = await canEditNegotiation(session.id, interaction.projectId, interaction.globalRecordId)
    if (!canEdit) {
      throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat toto jednání. Nejste přiřazeni k tomuto partnerovi.' })
    }
  }

  const isAssignee = interaction.assignees.some(a => a.userId === session.id)

  return { session, interaction, access, isAssignee, isCreator }
}

