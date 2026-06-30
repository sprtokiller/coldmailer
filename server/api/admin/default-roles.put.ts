import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ roleIds?: string[]; projectRoleIds?: string[] }>(event)
  const projectRoleIds = body.projectRoleIds ?? []

  await prisma.systemConfig.upsert({
    where: { key: 'newUser.defaults' },
    create: { key: 'newUser.defaults', value: { projectRoleIds } },
    update: { value: { projectRoleIds } },
  })

  return { ok: true }
})

