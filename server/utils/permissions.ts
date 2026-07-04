import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export async function requireAdmin(event: H3Event) {
  const session = await requireAuth(event)
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { isAdmin: true } })
  if (!user?.isAdmin) {
    throw createError({ statusCode: 403, message: 'PĹ™Ă­stup pouze pro administrĂˇtory.' })
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
      isAdmin: true,
      projectRoles: {
        select: {
          projectRole: { select: { projectId: true, project: { select: { groupId: true } } } },
        },
      },
    },
  })

  if (!user) return { isAdmin: false, projectIds: [] as string[], groupIds: [] as string[] }

  const projectIds = [...new Set(user.projectRoles.map(upr => upr.projectRole.projectId))]
  const groupIds = [...new Set(user.projectRoles.map(upr => upr.projectRole.project.groupId))]

  return {
    isAdmin: user.isAdmin,
    projectIds,
    groupIds,
  }
}

export async function requireProjectAccess(event: H3Event, projectId: string) {
  const session = await requireAuth(event)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { group: true },
  })
  if (!project) {
    throw createError({ statusCode: 404, message: 'Projekt nebyl nalezen.' })
  }

  const access = await getUserScopeAccess(session.id)
  const allowed = access.isAdmin || access.projectIds.includes(projectId)

  if (!allowed) {
    throw createError({ statusCode: 403, message: 'K tomuto projektu nemĂˇte pĹ™Ă­stup.' })
  }

  return { session, project }
}

export async function requirePipelineAccess(event: H3Event, _pipelineRunId: string) {
  await requireAuth(event)
  throw createError({ statusCode: 404, message: 'Pipeline nebyla nalezena.' })
}

export async function requireLibraryScopeAccess(event: H3Event, scope: ScopedResource) {
  const session = await requireAuth(event)
  const hasProject = Boolean(scope.projectId)
  const hasGroup = Boolean(scope.groupId)

  if (hasProject === hasGroup) {
    throw createError({
      statusCode: 400,
      message: 'Vyberte prĂˇvÄ› jeden Projekt nebo Typ projektu.',
    })
  }

  if (scope.projectId) {
    return requireProjectAccess(event, scope.projectId)
  }

  const access = await getUserScopeAccess(session.id)
  if (!access.isAdmin && !access.groupIds.includes(scope.groupId!)) {
    throw createError({ statusCode: 403, message: 'K tomuto typu projektu nemĂˇte pĹ™Ă­stup.' })
  }

  const group = await prisma.group.findUnique({ where: { id: scope.groupId! } })
  if (!group) {
    throw createError({ statusCode: 404, message: 'Typ projektu nebyl nalezen.' })
  }

  return { session, group }
}

export async function requireResourceScopeAccess(event: H3Event, resource: ScopedResource) {
  if (!resource.projectId && !resource.groupId) {
    const session = await requireAuth(event)
    const access = await getUserScopeAccess(session.id)
    if (!access.isAdmin) {
      throw createError({ statusCode: 403, message: 'K tĂ©to poloĹľce nemĂˇte pĹ™Ă­stup.' })
    }
    return
  }
  await requireLibraryScopeAccess(event, resource)
}

