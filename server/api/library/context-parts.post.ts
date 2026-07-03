import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'
import { REASONING_STEP_TYPES } from '~/config/pipeline'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{
    name: string
    content: string
    stepKeys?: string[]
    derivedFromId?: string
    projectId?: string | null
    groupId?: string | null
  }>(event)
  const scope = await resolveLibraryScope(event, body)
  const stepKeys = (body.stepKeys ?? ['VALUE_ALIGNMENT']).filter(k => REASONING_STEP_TYPES.includes(k as never))

  const maxOrder = await prisma.contextPart.aggregate({ _max: { order: true } })

  return prisma.contextPart.create({
    data: {
      name: body.name,
      content: body.content,
      stepKeys: stepKeys.length ? stepKeys : ['VALUE_ALIGNMENT'],
      order: (maxOrder._max.order ?? -1) + 1,
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

