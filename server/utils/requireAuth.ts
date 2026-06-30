import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'

export async function requireAuth(event: H3Event) {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true, isAdmin: true },
  })
  if (!dbUser) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  return dbUser
}

