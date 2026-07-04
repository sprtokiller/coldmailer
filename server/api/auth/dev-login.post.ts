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

  const body = await readBody<{ role: 'obchodni-tym' | 'vedeni-obchodu' }>(event).catch(() => ({ role: 'obchodni-tym' as const }))
  const role = body.role ?? 'obchodni-tym'

  const configs = {
    'vedeni-obchodu': {
      email: 'test-vedeni-obchodu@dev.local',
      googleId: 'dev-vedeni-obchodu',
      name: 'Test – Vedení obchodu',
      roleName: 'Vedení obchodu',
    },
    'obchodni-tym': {
      email: 'test-obchodni-tym@dev.local',
      googleId: 'dev-obchodni-tym',
      name: 'Test – Obchodní tým',
      roleName: 'Obchodní tým',
    },
  }

  const cfg = configs[role] ?? configs['obchodni-tym']

  const testUser = await prisma.user.upsert({
    where: { email: cfg.email },
    create: { googleId: cfg.googleId, email: cfg.email, name: cfg.name, isAdmin: false },
    update: {},
    select: { id: true, email: true, name: true, image: true },
  })

  const projectRoles = await prisma.projectRole.findMany({ where: { name: cfg.roleName } })
  await Promise.all(
    projectRoles.map(r =>
      prisma.userProjectRole.upsert({
        where: { userId_projectRoleId: { userId: testUser.id, projectRoleId: r.id } },
        create: { userId: testUser.id, projectRoleId: r.id },
        update: {},
      }),
    ),
  )

  await setUserSession(event, { user: testUser })
  return { ok: true }
})
