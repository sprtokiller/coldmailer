import { prisma } from '~/server/utils/prisma'
import { requirePermission, requireResourceScopeAccess } from '~/server/utils/permissions'
import { resolveLibraryScope } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'prompts.own.edit')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{
    name: string
    content: string
    stepType: string
    projectId?: string | null
    groupId?: string | null
  }>(event)

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })

  // isSystem prompts require prompts.system.edit
  if (prompt.isSystem) {
    await requirePermission(event, 'prompts.system.edit')
  } else if (prompt.authorId !== user.id) {
    // Other user's prompt requires prompts.others.edit
    await requirePermission(event, 'prompts.others.edit')
  }
  if (!prompt.isSystem) await requireResourceScopeAccess(event, prompt)

  if (!body.content.includes('<[[SCHEMA]]>')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Prompt musí obsahovat placeholder <[[SCHEMA]]> pro vložení výstupního schématu.',
    })
  }

  const scope = ('projectId' in body || 'groupId' in body)
    ? await resolveLibraryScope(event, body)
    : {}

  return prisma.systemPrompt.update({
    where: { id },
    data: { name: body.name, content: body.content, stepType: body.stepType as never, ...scope },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
  })
})
