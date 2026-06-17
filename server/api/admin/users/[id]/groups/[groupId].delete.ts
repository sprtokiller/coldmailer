import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const groupId = getRouterParam(event, 'groupId')!

  await prisma.userGroup.delete({
    where: { userId_groupId: { userId, groupId } },
  }).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'Členství nenalezeno' })
  })

  return { ok: true }
})
