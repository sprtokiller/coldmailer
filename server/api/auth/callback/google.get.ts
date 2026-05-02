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

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  })

  return sendRedirect(event, '/')
})
