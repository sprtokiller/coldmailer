/**
 * POST /api/work/[id]/cancel
 *
 * Zruší běžící úlohu z work registru (vlastník nebo admin).
 */
import { requireAuth } from '~/server/utils/requireAuth'
import { cancelWork } from '~/server/utils/work-registry'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const cancelled = cancelWork(id, user.id, user.isAdmin)
  if (!cancelled) {
    throw createError({ statusCode: 400, message: 'Úlohu nelze zrušit — už doběhla, nelze ji přerušit, nebo k ní nemáte přístup.' })
  }
  return { cancelled: true }
})
