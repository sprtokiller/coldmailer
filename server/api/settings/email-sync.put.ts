import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

const CONFIG_KEY = 'email.syncHistoryDays'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, 'admin.roles')
  const body = await readBody<{ days: number }>(event)
  const days = Math.max(1, Math.min(365, Math.round(body.days ?? 30)))

  await prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: days as never, updatedBy: session.id },
    update: { value: days as never, updatedBy: session.id },
  })

  return { emailSyncHistoryDays: days }
})
