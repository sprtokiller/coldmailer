import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [configRow, projectRoles] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'newUser.defaults' } }),
    prisma.projectRole.findMany({
      include: { project: { include: { group: true } } },
      orderBy: [{ project: { group: { name: 'asc' } } }, { project: { name: 'asc' } }, { name: 'asc' }],
    }),
  ])

  const defaults = (configRow?.value ?? {}) as { projectRoleIds?: string[] }

  return {
    roleIds: [] as string[],
    projectRoleIds: defaults.projectRoleIds ?? [],
    availableRoles: [],
    availableProjectRoles: projectRoles.map(pr => ({
      id: pr.id,
      name: pr.name,
      projectName: pr.project.name,
      groupName: pr.project.group.name,
    })),
  }
})

