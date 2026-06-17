import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; color?: string }>(event)

  return prisma.group.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  })
})
