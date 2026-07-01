import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)

  if (!projectId) return { ok: true }

  const body = await readBody<{
    contactBlacklist?: string[]
    emailDisplayMode?: string
    additionalAddresses?: string[]
    autoIncludeDomain?: boolean
  }>(event)

  const data: Record<string, unknown> = {}
  if (body.contactBlacklist !== undefined) data.contactBlacklist = body.contactBlacklist
  if (body.emailDisplayMode !== undefined) data.emailDisplayMode = body.emailDisplayMode
  if (body.additionalAddresses !== undefined) data.additionalAddresses = body.additionalAddresses
  if (body.autoIncludeDomain !== undefined) data.autoIncludeDomain = body.autoIncludeDomain

  if (Object.keys(data).length === 0) return { ok: true }

  // Cross-validate: an address cannot be in both lists
  if (data.contactBlacklist !== undefined || data.additionalAddresses !== undefined) {
    const existing = await prisma.projectRecord.findUnique({
      where: { projectId_globalRecordId: { globalRecordId, projectId } },
      select: { contactBlacklist: true, additionalAddresses: true },
    })

    const blacklist = (data.contactBlacklist as string[] | undefined)
      ?? (Array.isArray(existing?.contactBlacklist) ? (existing.contactBlacklist as string[]) : [])
    const whitelist = (data.additionalAddresses as string[] | undefined)
      ?? (Array.isArray(existing?.additionalAddresses) ? (existing.additionalAddresses as string[]) : [])

    const blacklistSet = new Set(blacklist)
    const overlap = whitelist.filter(e => blacklistSet.has(e))
    if (overlap.length > 0) {
      throw createError({
        statusCode: 400,
        message: `E-mail ${overlap[0]} nemůže být v blacklistu i v přídavných adresách zároveň.`,
      })
    }
  }

  await prisma.projectRecord.upsert({
    where: { projectId_globalRecordId: { globalRecordId, projectId } },
    create: { globalRecordId, projectId, ...data },
    update: data,
  })

  return { ok: true }
})
