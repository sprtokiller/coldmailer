import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const groupId = await getActiveGroupId(event)
  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: 'Nejprve musí být vybrán projekt.' })
  }
  const { myToThem, themToUs, contactBlacklist, emailDisplayMode } = await readBody(event)

  const data: Record<string, unknown> = {}
  if (myToThem !== undefined) data.myToThem = myToThem ?? null
  if (themToUs !== undefined) data.themToUs = themToUs ?? null
  if (contactBlacklist !== undefined) {
    if (contactBlacklist !== null && !Array.isArray(contactBlacklist)) {
      throw createError({ statusCode: 400, statusMessage: 'contactBlacklist must be an array of strings or null' })
    }
    data.contactBlacklist = contactBlacklist
      ? (contactBlacklist as string[]).map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : null
  }
  if (emailDisplayMode !== undefined) {
    if (emailDisplayMode !== 'text' && emailDisplayMode !== 'html') {
      throw createError({ statusCode: 400, statusMessage: 'emailDisplayMode must be "text" or "html"' })
    }
    data.emailDisplayMode = emailDisplayMode
  }

  return prisma.partnerFulfillment.upsert({
    where: { globalRecordId_groupId: { globalRecordId, groupId } },
    create: {
      globalRecordId,
      groupId,
      myToThem: (data.myToThem as string) ?? null,
      themToUs: (data.themToUs as string) ?? null,
      contactBlacklist: (data.contactBlacklist as string[]) ?? null,
    },
    update: data,
  })
})
