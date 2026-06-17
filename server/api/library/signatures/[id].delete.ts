import { prisma } from '~/server/utils/prisma'
import { requirePermission, getEffectivePermissions } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const sig = await prisma.signature.findUnique({ where: { id } })
  if (!sig) throw createError({ statusCode: 404, statusMessage: 'Podpis nenalezen' })

  if (sig.isSystem) {
    await requirePermission(event, 'signatures.system.edit')
  } else {
    if (sig.authorId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Nemáte oprávnění smazat tento podpis' })
    const perms = await getEffectivePermissions(user.id)
    if (!perms.includes('signatures.own.edit')) throw createError({ statusCode: 403, statusMessage: 'Nemáte oprávnění: signatures.own.edit' })
  }

  await prisma.signature.delete({ where: { id } })
  return { ok: true }
})
