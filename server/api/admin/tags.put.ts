import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireAdmin } from '~/server/utils/permissions'

const TAG_KEY = 'tags.partnerIndustry'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireAdmin(event)

  const body = await readBody<{ tags: string[] }>(event)
  if (!Array.isArray(body.tags)) {
    throw createError({ statusCode: 400, statusMessage: 'tags must be an array of strings' })
  }

  const tags = [...new Set(body.tags.map(t => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'))

  await prisma.systemConfig.upsert({
    where: { key: TAG_KEY },
    create: { key: TAG_KEY, value: tags as never, updatedBy: user.id },
    update: { value: tags as never, updatedBy: user.id },
  })

  return { tags }
})
