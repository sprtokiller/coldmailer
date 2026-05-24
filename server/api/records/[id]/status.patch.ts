import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { updateRelevanceStatus } from '~/server/utils/global-record'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const recordId = getRouterParam(event, 'id')!
  const { status, pipelineRunId } = await readBody<{ status: string; pipelineRunId?: string }>(event)

  const record = await prisma.globalRecord.findUnique({ where: { id: recordId } })
  if (!record) throw createError({ statusCode: 404, statusMessage: 'Record not found' })

  await updateRelevanceStatus(recordId, status as never, user.id, pipelineRunId)
  return { id: recordId, relevanceStatus: status }
})
