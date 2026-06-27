import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

const CONFIG_KEY = 'newUser.defaults'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.system')

  const [configRow, roles, groups] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.group.findMany({
      include: {
        projects: {
          include: { projectRoles: { orderBy: { name: 'asc' } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  const config = (configRow?.value ?? {}) as { roleIds?: string[]; projectRoleIds?: string[] }

  return {
    roleIds: config.roleIds ?? [],
    projectRoleIds: config.projectRoleIds ?? [],
    availableRoles: roles.map(r => ({ id: r.id, name: r.name, color: r.color })),
    availableProjectRoles: groups.flatMap(g =>
      g.projects.flatMap(p =>
        p.projectRoles.map(pr => ({
          id: pr.id,
          name: pr.name,
          projectName: p.name,
          groupName: g.name,
        })),
      ),
    ),
  }
})
