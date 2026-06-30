import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const pipelineRunId = getRouterParam(event, 'id')!
  const sourceId = getRouterParam(event, 'sourceId')!
  const { action } = await readBody<{ action: 'move_to_db' | 'delete_new' }>(event)

  const source = await prisma.inputSource.findUnique({
    where: { id: sourceId },
    include: { recordRefs: { select: { id: true, globalRecordId: true } } },
  })
  if (!source || source.pipelineRunId !== pipelineRunId) {
    throw createError({ statusCode: 404, message: 'Source not found' })
  }

  if (action === 'delete_new') {
    for (const ref of source.recordRefs) {
      const totalRefs = await prisma.pipelineRecordRef.count({ where: { globalRecordId: ref.globalRecordId } })
      if (totalRefs === 1) {
        await prisma.globalRecord.delete({ where: { id: ref.globalRecordId } })
      } else {
        await prisma.pipelineRecordRef.delete({ where: { id: ref.id } })
      }
    }
  } else {
    await prisma.pipelineRecordRef.deleteMany({ where: { inputSourceId: sourceId } })
  }

  await prisma.inputSource.delete({ where: { id: sourceId } })
  return { ok: true }
})
