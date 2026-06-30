/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/save
 *
 * Uloží nebo aktualizuje PartnerOutreachDraft (ručně editovaný e-mail).
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

interface SaveBody {
  toAddress: string
  subject: string
  body: string
  config?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  const body = await readBody<SaveBody>(event)

  await requireProjectAccess(event, projectId)

  if (!body.body) throw createError({ statusCode: 400, message: 'Tělo e-mailu je povinné.' })

  const draft = await prisma.partnerOutreachDraft.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: {
      projectId,
      globalRecordId,
      toAddress: body.toAddress ?? '',
      subject: body.subject ?? '',
      body: body.body,
      config: (body.config ?? null) as never,
      savedById: user.id,
    },
    update: {
      toAddress: body.toAddress ?? '',
      subject: body.subject ?? '',
      body: body.body,
      config: (body.config ?? null) as never,
      savedById: user.id,
      savedAt: new Date(),
    },
    include: { savedBy: { select: { id: true, name: true } } },
  })

  return draft
})
