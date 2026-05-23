import { type Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getEffectivePermissions } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const perms = await getEffectivePermissions(session.id)
  const OR: Prisma.SellingPointWhereInput[] = []
  if (perms.includes('selling.own.read'))    OR.push({ authorId: session.id })
  if (perms.includes('selling.others.read')) OR.push({ authorId: { not: session.id } })
  if (OR.length === 0) return []

  return prisma.sellingPoint.findMany({
    where: { OR },
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
