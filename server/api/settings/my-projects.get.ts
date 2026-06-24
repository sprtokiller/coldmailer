import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getUserScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const access = await getUserScopeAccess(session.id)

  if (access.isSuperAdmin || access.isAdmin) {
    const groups = await prisma.group.findMany({
      include: { projects: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    })

    return groups.map(g => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      projects: g.projects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        groupId: p.groupId,
        createdAt: p.createdAt,
      })),
    }))
  }

  if (access.projectIds.length === 0) return []

  const groups = await prisma.group.findMany({
    where: { id: { in: access.groupIds } },
    include: {
      projects: {
        where: { id: { in: access.projectIds } },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return groups.map(g => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    color: g.color,
    projects: g.projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      groupId: p.groupId,
      createdAt: p.createdAt,
    })),
  }))
})
