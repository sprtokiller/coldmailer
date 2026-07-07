import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'

// Throttle window for "last seen" updates so every API call doesn't hit the DB.
const LAST_SEEN_THROTTLE_MS = 60_000

export async function requireAuth(event: H3Event) {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true, isAdmin: true, lastLoginAt: true },
  })
  if (!dbUser) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // "lastLoginAt" tracks last activity in the app, not just sign-in — refresh it on
  // any authenticated request (page load, API call, Gmail fetch, ...), throttled.
  if (!dbUser.lastLoginAt || Date.now() - dbUser.lastLoginAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
  }

  return dbUser
}

