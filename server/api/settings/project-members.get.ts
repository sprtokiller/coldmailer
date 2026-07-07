/**
 * GET /api/settings/project-members
 *
 * Vrací projekty, kde má přihlášený uživatel oprávnění `project.pipeline.manage`
 * (tj. role "Vedení obchodu"), spolu se seznamem členů každého projektu
 * a jejich poslední aktivitou v aplikaci.
 *
 * Admini vidí všechny projekty – pro ně tato sekce nemá smysl, ale endpoint
 * je dostupný i pro ně bez omezení.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getUnreadCountForUser } from '~/server/utils/unread-email-count'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const userId = session.id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  })

  // Načteme všechny role přihlášeného uživatele
  const myRoles = await prisma.userProjectRole.findMany({
    where: { userId },
    include: {
      projectRole: {
        select: {
          permissions: true,
          projectId: true,
          project: {
            include: { group: true },
          },
        },
      },
    },
  })

  // Projekty, kde má uživatel pipeline.manage (nebo je admin → vidí vše)
  let managedProjectIds: string[]

  if (user?.isAdmin) {
    const allProjects = await prisma.project.findMany({ select: { id: true } })
    managedProjectIds = allProjects.map(p => p.id)
  } else {
    managedProjectIds = [
      ...new Set(
        myRoles
          .filter(r => r.projectRole.permissions.includes('project.pipeline.manage'))
          .map(r => r.projectRole.projectId),
      ),
    ]
  }

  if (managedProjectIds.length === 0) return []

  // Pro každý projekt načteme seznam členů (uživatelů s jakoukoliv rolí)
  const projects = await prisma.project.findMany({
    where: { id: { in: managedProjectIds } },
    include: {
      group: true,
      projectRoles: {
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  lastLoginAt: true,
                },
              },
              projectRole: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return Promise.all(projects.map(async project => {
    // Deduplikace uživatelů – uživatel může mít víc rolí ve stejném projektu
    const memberMap = new Map<string, {
      id: string
      name: string
      email: string
      image: string | null
      lastLoginAt: string | null
      roles: string[]
    }>()

    for (const role of project.projectRoles) {
      for (const assignment of role.users) {
        const u = assignment.user
        if (!memberMap.has(u.id)) {
          memberMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            roles: [],
          })
        }
        memberMap.get(u.id)!.roles.push(assignment.projectRole.name)
      }
    }

    const members = await Promise.all(
      [...memberMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
        .map(async m => ({ ...m, unreadEmailCount: await getUnreadCountForUser(m.id, project.id) })),
    )

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      group: {
        id: project.group.id,
        name: project.group.name,
        color: project.group.color,
      },
      members,
    }
  }))
})
