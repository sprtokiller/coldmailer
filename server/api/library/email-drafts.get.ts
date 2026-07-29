import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getLibraryScopeFilter } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const scopeFilter = await getLibraryScopeFilter(event)

  // Optional filter by usage category. Empty usageTypes counts as OUTREACH for
  // backward compatibility with drafts created before the category existed.
  const usage = getQuery(event).usage
  const usageFilter = usage === 'REMINDER'
    ? { usageTypes: { has: 'REMINDER' } }
    : usage === 'OUTREACH'
      ? { OR: [{ usageTypes: { has: 'OUTREACH' } }, { usageTypes: { isEmpty: true } }] }
      : null

  // AND-combine (not spread) — both scopeFilter and the OUTREACH usageFilter can carry
  // their own `OR`, which a shallow spread would clobber.
  const where = usageFilter ? { AND: [scopeFilter, usageFilter] } : scopeFilter

  return prisma.emailDraft.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
})

