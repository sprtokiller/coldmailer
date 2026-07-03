import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'
import { REASONING_STEP_TYPES, getMissingPlaceholders } from '~/config/pipeline'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{
    name: string
    content: string
    stepType: string
    projectId?: string | null
    groupId?: string | null
  }>(event)

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, message: 'Prompt not found' })

  if (!REASONING_STEP_TYPES.includes(prompt.stepType as never) || !REASONING_STEP_TYPES.includes(body.stepType as never)) {
    throw createError({ statusCode: 400, message: 'Tento typ kroku už není podporovaný.' })
  }

  // isSystem prompts require prompts.system.edit
  if (prompt.isSystem) {
    await requireAdmin(event)
  } else if (prompt.authorId !== user.id) {
    // Other user's prompt requires prompts.others.edit
    await requireAdmin(event)
  }
  if (!prompt.isSystem) await requireResourceScopeAccess(event, prompt)

  const missingPlaceholders = getMissingPlaceholders(body.stepType, body.content)
  if (missingPlaceholders.length) {
    throw createError({
      statusCode: 400,
      message: `Promptu chybí povinné placeholdery: ${missingPlaceholders.join(', ')}.`,
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
