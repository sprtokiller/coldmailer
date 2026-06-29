import { requireAuth } from '~/server/utils/requireAuth'
import { requireAdmin } from '~/server/utils/permissions'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireAdmin(event)

  const userId = getRouterParam(event, 'userId')!

  // Detailed usage events for this user — last 90 days, by model
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [byModel, daily, budget] = await Promise.all([
    // Group by model for breakdown
    prisma.usageEvent.groupBy({
      by: ['model', 'eventType'],
      _sum: { costUsd: true },
      _count: { id: true },
      where: { userId, createdAt: { gte: ninetyDaysAgo } },
      orderBy: { _sum: { costUsd: 'desc' } },
    }),

    // Daily cost for chart (last 30 days)
    prisma.$queryRaw<{ day: string; costUsd: number; count: bigint }[]>`
      SELECT
        DATE("createdAt")::text AS day,
        SUM("costUsd") AS "costUsd",
        COUNT(*) AS count
      FROM "UsageEvent"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE("createdAt")
      ORDER BY DATE("createdAt")
    `,

    prisma.userBudget.findUnique({ where: { userId } }),
  ])

  return {
    userId,
    budget,
    byModel: byModel.map(r => ({
      model:     r.model ?? 'unknown',
      eventType: r.eventType,
      costUsd:   r._sum.costUsd ?? 0,
      count:     r._count.id,
    })),
    daily: daily.map(r => ({
      day:     r.day,
      costUsd: Number(r.costUsd),
      count:   Number(r.count),
    })),
  }
})
