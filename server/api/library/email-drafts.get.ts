import { type Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getEffectivePermissions } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const perms = await getEffectivePermissions(session.id)
  const OR: Prisma.EmailDraftWhereInput[] = []
  if (perms.includes('drafts.own.read'))    OR.push({ authorId: session.id })
  if (perms.includes('drafts.others.read')) OR.push({ authorId: { not: session.id } })
  if (OR.length === 0) return []

  return prisma.emailDraft.findMany({
    where: { OR },
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
