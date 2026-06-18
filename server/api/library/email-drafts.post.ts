import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { resolveLibraryScope } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'drafts.own.edit')
  const body = await readBody<{
    name: string
    subject: string
    body: string
    derivedFromId?: string
    projectId?: string | null
    groupId?: string | null
  }>(event)
  const scope = await resolveLibraryScope(event, body)

  return prisma.emailDraft.create({
    data: {
      name: body.name,
      subject: body.subject,
      body: body.body,
      authorId: user.id,
      ...scope,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
  })
})
