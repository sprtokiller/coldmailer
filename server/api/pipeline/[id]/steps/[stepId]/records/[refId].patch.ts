import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const refId = getRouterParam(event, 'refId')!
  const body = await readBody<{
    isSelectedForProcessing?: boolean
    localStatus?: string | null
    localNote?: string | null
  }>(event)

  const ref = await prisma.pipelineRecordRef.findUnique({ where: { id: refId } })
  if (!ref) throw createError({ statusCode: 404, statusMessage: 'Ref not found' })

  return prisma.pipelineRecordRef.update({
    where: { id: refId },
    data: {
      ...(body.isSelectedForProcessing !== undefined && { isSelectedForProcessing: body.isSelectedForProcessing }),
      ...(body.localStatus !== undefined && { localStatus: body.localStatus as never }),
      ...(body.localNote !== undefined && { localNote: body.localNote }),
    },
  })
})
