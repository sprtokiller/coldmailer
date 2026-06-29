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
  }>(event)

  const data: any = {}
  if (body.contactBlacklist !== undefined) data.contactBlacklist = body.contactBlacklist
  if (body.emailDisplayMode !== undefined) data.emailDisplayMode = body.emailDisplayMode

  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.projectRecord.upsert({
    where: { projectId_globalRecordId: { globalRecordId, projectId } },
    create: { globalRecordId, projectId, ...data },
    update: data,
  })

  return { ok: true }
})
