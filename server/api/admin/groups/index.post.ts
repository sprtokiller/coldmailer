import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ name: string; slug: string; color?: string }>(event)

  if (!body.name?.trim() || !body.slug?.trim()) {
    throw createError({ statusCode: 400, message: 'NĂˇzev a slug jsou povinnĂ©' })
  }

  return prisma.group.create({
    data: { name: body.name.trim(), slug: body.slug.trim().toLowerCase(), color: body.color ?? '#6366f1' },
  })
})

