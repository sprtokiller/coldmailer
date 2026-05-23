import { exchangeCode, getUserInfo } from '~/server/utils/google'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string | undefined

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Missing authorization code' })
  }

  const config = useRuntimeConfig(event)
  const tokens = await exchangeCode(code, config.googleClientId, config.googleClientSecret, config.googleRedirectUri)
  const info = await getUserInfo(tokens.access_token)

  if (!info.email.endsWith('@scg.cz')) {
    return sendRedirect(event, '/login?error=unauthorized_domain')
  }

  const user = await prisma.user.upsert({
    where: { googleId: info.sub },
    create: {
      googleId: info.sub,
      email: info.email,
      name: info.name,
      image: info.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
    update: {
      name: info.name,
      image: info.picture,
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })

  // If no superadmin exists in the system yet, promote the logging-in user
  const superadminCount = await prisma.user.count({ where: { isSuperAdmin: true } })
  if (superadminCount === 0) {
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } })
  }

  const finalUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, image: true, isSuperAdmin: true } })

  await setUserSession(event, {
    user: {
      id: finalUser!.id,
      email: finalUser!.email,
      name: finalUser!.name,
      image: finalUser!.image,
      isSuperAdmin: finalUser!.isSuperAdmin,
    },
  })

  return sendRedirect(event, '/')
})
