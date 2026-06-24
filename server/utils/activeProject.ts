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
      const allowed = access.isSuperAdmin || access.isAdmin || access.projectIds.includes(projectId)
      if (allowed) {
        return { project, group: project.group }
      }
    }
    deleteCookie(event, 'activeProjectId', { path: '/' })
  }

  // Fallback to last available project
  const access = await getUserScopeAccess(session.id)

  const findAndSetProject = async (where?: object) => {
    const lastProject = await prisma.project.findFirst({
      ...(where ? { where } : {}),
      include: { group: true },
      orderBy: { name: 'desc' },
    })
    if (lastProject) {
      setCookie(event, 'activeProjectId', `project:${lastProject.id}`, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
      return { project: lastProject, group: lastProject.group } as ActiveScope
    }
    return null
  }

  if (access.isSuperAdmin || access.isAdmin) {
    const result = await findAndSetProject()
    if (result) return result
  } else if (access.projectIds.length > 0) {
    const result = await findAndSetProject({ id: { in: access.projectIds } })
    if (result) return result
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

