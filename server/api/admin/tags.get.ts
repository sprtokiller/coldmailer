import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const TAG_KEY = 'tags.partnerIndustry'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const row = await prisma.systemConfig.findUnique({ where: { key: TAG_KEY } })
  const tags = (row?.value as string[] | null) ?? []
  return { tags }
})
