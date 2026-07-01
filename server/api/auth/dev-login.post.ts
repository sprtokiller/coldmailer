/**
 * POST /api/auth/dev-login
 *
 * Výhradně pro vývoj (NODE_ENV !== 'production').
 * Přihlásí předpřipraveného testovacího uživatele bez Google OAuth.
 */
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 403, message: 'Not available in production.' })
  }

  const body = await readBody<{ role?: 'obchodni-tym' | 'vedeni-obchodu' }>(event).catch(() => ({}))
  const role = body?.role ?? 'obchodni-tym'

  if (role === 'vedeni-obchodu') {
    const testUser = await prisma.user.upsert({
      where: { email: 'test-vedeni-obchodu@dev.local' },
      create: {
        googleId: 'dev-vedeni-obchodu',
        email: 'test-vedeni-obchodu@dev.local',
        name: 'Test – Vedení obchodu',
        isAdmin: false,
      },
      update: {},
      select: { id: true, email: true, name: true, image: true, isAdmin: true },
    })
    const roles = await prisma.projectRole.findMany({ where: { name: 'Vedení obchodu' } })
    await Promise.all(
      roles.map(r =>
        prisma.userProjectRole.upsert({
          where: { userId_projectRoleId: { userId: testUser.id, projectRoleId: r.id } },
          create: { userId: testUser.id, projectRoleId: r.id },
          update: {},
        }),
      ),
    )
    await setUserSession(event, { user: testUser })
    return sendRedirect(event, '/')
  }

  // Default: Obchodní tým
  const testUser = await prisma.user.upsert({
    where: { email: 'test-obchodni-tym@dev.local' },
    create: {
      googleId: 'dev-obchodni-tym',
      email: 'test-obchodni-tym@dev.local',
      name: 'Test – Obchodní tým',
      isAdmin: false,
    },
    update: {},
    select: { id: true, email: true, name: true, image: true, isAdmin: true },
  })
  const roles = await prisma.projectRole.findMany({ where: { name: 'Obchodní tým' } })
  await Promise.all(
    roles.map(r =>
      prisma.userProjectRole.upsert({
        where: { userId_projectRoleId: { userId: testUser.id, projectRoleId: r.id } },
        create: { userId: testUser.id, projectRoleId: r.id },
        update: {},
      }),
    ),
  )
  await setUserSession(event, { user: testUser })
  return sendRedirect(event, '/')
})
