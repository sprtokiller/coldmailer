import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const CONFIG_KEY = 'email.syncHistoryDays'
const DEFAULT_DAYS = 30

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } })
  const days = typeof row?.value === 'number' ? row.value : DEFAULT_DAYS
  return { emailSyncHistoryDays: days }
})
