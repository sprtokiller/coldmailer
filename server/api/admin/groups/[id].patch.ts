import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
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
