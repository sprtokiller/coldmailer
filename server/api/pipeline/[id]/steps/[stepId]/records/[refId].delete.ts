import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const refId = getRouterParam(event, 'refId')!

  await prisma.pipelineRecordRef.delete({ where: { id: refId } })

  return { ok: true }
})
