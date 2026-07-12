import type { H3Event } from 'h3'
import { getActiveProject, getActiveScope } from '~/server/utils/activeProject'
import { getUserScopeAccess, requireLibraryScopeAccess, requireProjectAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export type LibraryScopeInput = {
  projectId?: string | null
  groupId?: string | null
}

export async function resolveLibraryScope(event: H3Event, input: LibraryScopeInput) {
  const projectId = input.projectId || null
  const groupId = input.groupId || null

  if (projectId || groupId) {
    await requireLibraryScopeAccess(event, { projectId, groupId })
    return { projectId, groupId }
  }

  const { project, group } = await getActiveScope(event)
  if (project) {
    return { projectId: project.id, groupId: null }
  }
  if (group) {
    return { projectId: null, groupId: group.id }
  }

  throw createError({
    statusCode: 400,
    message: 'Nejprve musĂ­ bĂ˝t vybrĂˇn nebo pĹ™iĹ™azen projekt nebo typ projektu.',
  })
}

export async function getLibraryScopeFilter(event: H3Event) {
  const session = await requireAuth(event)
  const requestedProjectId = getQuery(event).projectId
  const requestedGroupId = getQuery(event).groupId

  if (typeof requestedProjectId === 'string' && requestedProjectId) {
    const { project } = await requireProjectAccess(event, requestedProjectId)
    return {
      OR: [
        { projectId: project.id },
        { groupId: project.groupId },
      ],
    }
  }

  if (typeof requestedGroupId === 'string' && requestedGroupId) {
    await requireLibraryScopeAccess(event, { groupId: requestedGroupId })
    return {
      groupId: requestedGroupId,
      projectId: null,
    }
  }

  const { project, group } = await getActiveScope(event)

  if (project) {
    return {
      OR: [
        { projectId: project.id },
        { groupId: project.groupId },
      ],
    }
  }

  if (group) {
    return {
      groupId: group.id,
      projectId: null,
    }
  }

  const access = await getUserScopeAccess(session.id)
  if (access.isAdmin) return {}
  if (access.projectIds.length === 0 && access.groupIds.length === 0) {
    return { id: { equals: '__no_access__' } }
  }


  return {
    OR: [
      ...(access.projectIds.length > 0 ? [{ projectId: { in: access.projectIds } }] : []),
      ...(access.groupIds.length > 0 ? [{ groupId: { in: access.groupIds } }] : []),
    ],
  }
}

export function libraryScopeForProject(project: { id: string; groupId: string }) {
  return {
    OR: [
      { projectId: project.id },
      { groupId: project.groupId },
    ],
  }
}

// Context parts can additionally be private (user-scoped, no project/group) —
// those are only usable by their own author, regardless of active project.
export function contextPartAccessFilter(project: { id: string; groupId: string }, userId: string) {
  return {
    OR: [
      { projectId: project.id },
      { groupId: project.groupId },
      { authorId: userId, isPrivate: true },
    ],
  }
}

