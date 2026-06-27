import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

const CONFIG_KEY = 'newUser.defaults'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, 'admin.system')
  const body = await readBody<{ roleIds: string[]; projectRoleIds: string[] }>(event)

  if (!Array.isArray(body.roleIds) || !Array.isArray(body.projectRoleIds)) {
    throw createError({ statusCode: 400, statusMessage: 'roleIds and projectRoleIds must be arrays' })
  }

  const value = { roleIds: body.roleIds, projectRoleIds: body.projectRoleIds }

  await prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: value as never, updatedBy: session.id },
    update: { value: value as never, updatedBy: session.id },
  })

  return value
})
