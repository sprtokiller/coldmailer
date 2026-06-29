import { requireAuth } from '~/server/utils/requireAuth'
import { requireAdmin } from '~/server/utils/permissions'
import { prisma } from '~/server/utils/prisma'
import { getDefaultBudgetConfig } from '~/server/utils/usage-tracker'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireAdmin(event)

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isAdmin: true,
      createdAt: true,
      budget: true,
    },
  })

  // Per-user usage aggregates: total cost and event counts by type/model
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const usageAgg = await prisma.usageEvent.groupBy({
    by: ['userId', 'eventType'],
    _sum: { costUsd: true },
    _count: { id: true },
    where: { createdAt: { gte: thirtyDaysAgo } },
  })

  const defaultBudget = await getDefaultBudgetConfig()

  // Shape per-user summary
  const usersWithStats = users.map((u) => {
    const userAgg = usageAgg.filter(a => a.userId === u.id)
    const aiCost = userAgg.find(a => a.eventType === 'ai_completion')?._sum.costUsd ?? 0
    const aiCount = userAgg.find(a => a.eventType === 'ai_completion')?._count.id ?? 0
    const serpCount = userAgg.find(a => a.eventType === 'serp_search')?._count.id ?? 0

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      budget: u.budget,
      stats30d: { aiCost, aiCount, serpCount },
    }
  })

  return { users: usersWithStats, defaultBudget }
})
