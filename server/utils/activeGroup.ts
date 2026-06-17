import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export async function getActiveGroupId(event: H3Event): Promise<string | null> {
  const cookieVal = getCookie(event, 'activeGroupId')
  if (cookieVal) return cookieVal

  const session = await requireAuth(event)
  const membership = await prisma.userGroup.findFirst({
    where: { userId: session.id },
    orderBy: { group: { name: 'asc' } },
  })
  if (membership) {
    setCookie(event, 'activeGroupId', membership.groupId, { maxAge: 60 * 60 * 24 * 365, path: '/' })
    return membership.groupId
  }
  return null
}
