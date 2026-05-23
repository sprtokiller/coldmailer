import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ overrides: Array<{ key: string; granted: boolean | null }> }>(event)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })

  await Promise.all(body.overrides.map(async (ov) => {
    if (ov.granted === null) {
      await prisma.userPermission.deleteMany({ where: { userId, key: ov.key } })
    } else {
      await prisma.userPermission.upsert({
        where: { userId_key: { userId, key: ov.key } },
        create: { userId, key: ov.key, granted: ov.granted },
        update: { granted: ov.granted },
      })
    }
  }))

  return { ok: true }
})
