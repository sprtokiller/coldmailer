import { buildAuthUrl } from '~/server/utils/google'

export default defineEventHandler(async (event) => {
  const { googleClientId, googleRedirectUri } = useRuntimeConfig(event)
  return sendRedirect(event, buildAuthUrl(googleClientId, googleRedirectUri))
})
