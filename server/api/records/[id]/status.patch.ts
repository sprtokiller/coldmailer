import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { updateRelevanceStatus } from '~/server/utils/global-record'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const recordId = getRouterParam(event, 'id')!
  const { status } = await readBody<{ status: string }>(event)

  const record = await prisma.globalRecord.findUnique({ where: { id: recordId } })
  if (!record) throw createError({ statusCode: 404, message: 'Record not found' })

  await updateRelevanceStatus(recordId, status as never, user.id)
  return { id: recordId, relevanceStatus: status }
})
