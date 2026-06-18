import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getUserScopeAccess } from '~/server/utils/permissions'

export type ActiveScope = {
  project: any | null
  group: any | null
}

export async function getActiveScope(event: H3Event): Promise<ActiveScope> {
  const session = await requireAuth(event)
  const cookieActiveId = getCookie(event, 'activeProjectId')

  let projectId: string | null = null

  if (cookieActiveId) {
    if (cookieActiveId.startsWith('project:')) {
      projectId = cookieActiveId.replace('project:', '')
    } else if (!cookieActiveId.startsWith('group:')) {
      projectId = cookieActiveId
    }
  }

  // Verify access for projectId if set
  if (projectId) {
    const access = await getUserScopeAccess(session.id)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { group: true },
    })

    if (project) {
      const allowed = access.isSuperAdmin
        || access.projectIds.includes(projectId)
        || access.directGroupIds.includes(project.groupId)

      if (allowed) {
        return { project, group: project.group }
      }
    }
    deleteCookie(event, 'activeProjectId', { path: '/' })
  }

  // Fallback to last available project membership
  const access = await getUserScopeAccess(session.id)

  if (access.isSuperAdmin) {
    const lastProject = await prisma.project.findFirst({
      include: { group: true },
      orderBy: { name: 'desc' },
    })
    if (lastProject) {
      setCookie(event, 'activeProjectId', `project:${lastProject.id}`, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
      return { project: lastProject, group: lastProject.group }
    }
  } else {
    if (access.projectIds.length > 0) {
      const lastProject = await prisma.project.findFirst({
        where: { id: { in: access.projectIds } },
        include: { group: true },
        orderBy: { name: 'desc' },
      })
      if (lastProject) {
        setCookie(event, 'activeProjectId', `project:${lastProject.id}`, {
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        })
        return { project: lastProject, group: lastProject.group }
      }
    }
    
    // If they have no direct projects but have direct groups, try to get the last project under those groups
    if (access.directGroupIds.length > 0) {
      const lastProject = await prisma.project.findFirst({
        where: { groupId: { in: access.directGroupIds } },
        include: { group: true },
        orderBy: { name: 'desc' },
      })
      if (lastProject) {
        setCookie(event, 'activeProjectId', `project:${lastProject.id}`, {
          maxAge: 60 * 60 * 24 * 365,
          path: '/',
        })
        return { project: lastProject, group: lastProject.group }
      }
    }
  }

  return { project: null, group: null }
}


export async function getActiveProject(event: H3Event) {
  return (await getActiveScope(event)).project
}

export async function getActiveProjectId(event: H3Event): Promise<string | null> {
  return (await getActiveProject(event))?.id ?? null
}

export async function getActiveGroup(event: H3Event) {
  return (await getActiveScope(event)).group
}

export async function getActiveGroupId(event: H3Event): Promise<string | null> {
  return (await getActiveGroup(event))?.id ?? null
}

