import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const search = query.search as string | undefined
  const offset = Number(query.offset ?? 0)
  const limit = Math.min(Number(query.limit ?? 50), 200)

  const withCount = query.withCount === 'true'

  const where = {
    ...(type && { type: type as never }),
    ...(search && { canonicalName: { contains: search, mode: 'insensitive' as never } }),
  }

  const findMany = prisma.globalRecord.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { events: true } },
      negotiations: { where: { removedAt: null }, select: { project: { select: { id: true, name: true } }, negotiationStatus: true } },
      contacts: { select: { id: true, address: true, firstName: true, lastName: true, role: true, contactType: true, note: true, priority: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  })

  const scope = await getActiveScope(event)
  const projectId = scope.project?.id
  const access = projectId ? await getInteractionAccess(session.id, projectId) : null
  const canManageAll = access ? access.isAdmin || access.canEditAll : false

  if (!withCount) return { records: await findMany, canManageAll }

  const [records, total] = await Promise.all([findMany, prisma.globalRecord.count({ where })])
  return { records, total, canManageAll }
})

