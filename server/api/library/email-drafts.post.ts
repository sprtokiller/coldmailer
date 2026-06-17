import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'drafts.own.edit')
  const groupId = await getActiveGroupId(event)
  const body = await readBody<{
    name: string
    subject: string
    body: string
    derivedFromId?: string
  }>(event)

  return prisma.emailDraft.create({
    data: {
      name: body.name,
      subject: body.subject,
      body: body.body,
      authorId: user.id,
      groupId,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
