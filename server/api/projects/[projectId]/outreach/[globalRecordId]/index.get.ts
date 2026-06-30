/**
 * GET /api/projects/[projectId]/outreach/[globalRecordId]
 *
 * Vrátí alignment + draft pro konkrétního partnera v projektu.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  await requireProjectAccess(event, projectId)

  const [globalRecord, alignment, draft, assignment] = await Promise.all([
    prisma.globalRecord.findUnique({
      where: { id: globalRecordId },
      include: {
        contacts: {
          where: { address: { contains: '@' } },
          orderBy: [{ isPrimary: 'desc' }, { priority: 'asc' }],
        },
      },
    }),
    prisma.partnerAlignment.findUnique({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      include: { author: { select: { id: true, name: true, image: true } } },
    }),
    prisma.partnerOutreachDraft.findUnique({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      include: {
        savedBy: { select: { id: true, name: true, image: true } },
        sentBy: { select: { id: true, name: true } },
      },
    }),
    prisma.outreachAssignment.findUnique({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      include: { assignee: { select: { id: true, name: true, image: true } } },
    }),
  ])

  if (!globalRecord) throw createError({ statusCode: 404, message: 'Partner nenalezen.' })

  return {
    globalRecord: {
      id: globalRecord.id,
      canonicalName: globalRecord.canonicalName,
      type: globalRecord.type,
      payload: globalRecord.payload,
      contacts: globalRecord.contacts,
    },
    profileData: null,
    alignment,
    draft,
    assignment,
  }
})
