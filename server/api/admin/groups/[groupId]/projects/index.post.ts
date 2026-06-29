import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { ensureDefaultProjectRoles } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const groupId = getRouterParam(event, 'groupId')!
  const body = await readBody<{ name: string; slug: string }>(event)

  if (!body.name?.trim() || !body.slug?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Název a slug jsou povinné' })
  }

  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Typ projektu nebyl nalezen.' })
  }

  const project = await prisma.project.create({
    data: {
      name: body.name.trim(),
      slug: body.slug.trim().toLowerCase(),
      groupId,
    },
    include: { group: true },
  })

  await ensureDefaultProjectRoles(project.id)

  return project
})
