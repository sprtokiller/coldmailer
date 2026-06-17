import { requireAuth } from '~/server/utils/requireAuth'
import { requirePermission } from '~/server/utils/permissions'
import { prisma } from '~/server/utils/prisma'

interface PatchBody {
  limitUsd?: number | null
  resetPeriod?: 'never' | 'daily' | 'weekly' | 'monthly'
  resetUsedNow?: boolean   // immediately zero out usedUsd
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'userId')!
  const body = await readBody<PatchBody>(event)

  const data: Record<string, unknown> = {}

  if ('limitUsd' in body)     data.limitUsd = body.limitUsd ?? null
  if ('resetPeriod' in body)  data.resetPeriod = body.resetPeriod
  if (body.resetUsedNow)      { data.usedUsd = 0; data.periodStartAt = new Date() }

  // Set periodStartAt when switching to a period-based reset
  if (body.resetPeriod && body.resetPeriod !== 'never' && !body.resetUsedNow) {
    data.periodStartAt = new Date()
  }
  if (body.resetPeriod === 'never') {
    data.periodStartAt = null
  }

  const updated = await prisma.userBudget.upsert({
    where: { userId },
    create: {
      userId,
      limitUsd:     (body.limitUsd ?? null),
      resetPeriod:  (body.resetPeriod ?? 'never') as never,
      usedUsd:      body.resetUsedNow ? 0 : 0,
      periodStartAt: (body.resetPeriod && body.resetPeriod !== 'never') ? new Date() : null,
    },
    update: data,
  })

  return updated
})
