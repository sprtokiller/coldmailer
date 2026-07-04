import { exchangeCode, getUserInfo } from '~/server/utils/google'
import { prisma } from '~/server/utils/prisma'
import { applyDefaultBudgetToUser } from '~/server/utils/usage-tracker'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined

  if (!code) {
    throw createError({ statusCode: 400, message: 'Missing authorization code' })
  }

  const config = useRuntimeConfig(event)
  const tokens = await exchangeCode(code, config.googleClientId, config.googleClientSecret, config.googleRedirectUri)
  const info = await getUserInfo(tokens.access_token)

  if (!info.email.endsWith('@scg.cz')) {
    return sendRedirect(event, '/login?error=unauthorized_domain')
  }

  // Support pre-seeded users (placeholder googleId) â€” find by email first, then fall back to googleId
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: info.sub }, { email: info.email }] },
  })
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: info.sub,
          name: info.name,
          image: info.picture,
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        },
      })
    : await prisma.user.create({
        data: {
          googleId: info.sub,
          email: info.email,
          name: info.name,
          image: info.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        },
      })

  await applyDefaultBudgetToUser(user.id)

  // Apply default project roles to newly created users
  const isNewUser = Date.now() - user.createdAt.getTime() < 30_000
  if (isNewUser) {
    const configRow = await prisma.systemConfig.findUnique({ where: { key: 'newUser.defaults' } })
    if (configRow?.value) {
      const defaults = configRow.value as { projectRoleIds?: string[] }
      await Promise.all(
        (defaults.projectRoleIds ?? []).map(projectRoleId =>
          prisma.userProjectRole.upsert({
            where: { userId_projectRoleId: { userId: user.id, projectRoleId } },
            create: { userId: user.id, projectRoleId },
            update: {},
          }).catch(() => {}),
        ),
      )
    }
  }

  const adminEmails = (config.adminEmails || '').split(',').map((s: string) => s.trim()).filter(Boolean)
  if (adminEmails.includes(info.email)) {
    if (!user.isAdmin) await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } })
  } else if (!adminEmails.length) {
    // Fallback: no admin emails configured â†’ first user to log in becomes admin
    const adminCount = await prisma.user.count({ where: { isAdmin: true } })
    if (adminCount === 0) await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } })
  }

  const finalUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, image: true } })

  await setUserSession(event, {
    user: {
      id: finalUser!.id,
      email: finalUser!.email,
      name: finalUser!.name,
      image: finalUser!.image,
    },
  })

  return sendRedirect(event, '/')
})

