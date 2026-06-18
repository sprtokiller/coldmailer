import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getUserScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { isSuperAdmin: true },
  })

  if (user?.isSuperAdmin) {
    const groups = await prisma.group.findMany({
      include: {
        projects: { orderBy: { name: 'asc' } },
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
  }

  // Non-superadmin user: fetch memberships
  const [userGroups, userProjects] = await Promise.all([
    prisma.userGroup.findMany({
      where: { userId: session.id },
      select: { groupId: true },
    }),
    prisma.userProject.findMany({
      where: { userId: session.id },
      select: { projectId: true, project: { select: { groupId: true } } },
    }),
  ])

  const directGroupIds = userGroups.map(ug => ug.groupId)
  const directProjectIds = userProjects.map(up => up.projectId)
  const groupIdsFromProjects = userProjects.map(up => up.project.groupId)
  const allGroupIds = [...new Set([...directGroupIds, ...groupIdsFromProjects])]

  const groups = await prisma.group.findMany({
    where: {
      id: { in: allGroupIds },
    },
    include: {
      projects: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return groups.map(g => {
    // If the user has group-level access, they see all projects under that group.
    // Otherwise, they only see projects they are directly assigned to.
    const hasGroupAccess = directGroupIds.includes(g.id)
    const allowedProjects = hasGroupAccess
      ? g.projects
      : g.projects.filter(p => directProjectIds.includes(p.id))

    return {
      id: g.id,
      name: g.name,
      slug: g.slug,
      color: g.color,
      projects: allowedProjects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        groupId: p.groupId,
        createdAt: p.createdAt,
      })),
    }
  })
})

