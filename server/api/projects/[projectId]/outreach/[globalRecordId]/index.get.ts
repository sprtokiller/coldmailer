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

  const [globalRecord, alignment, draft, assignment, sentEmailCount] = await Promise.all([
    prisma.globalRecord.findUnique({
      where: { id: globalRecordId },
      include: {
        contacts: {
          where: { address: { contains: '@' } },
          orderBy: [{ priority: 'asc' }],
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
    prisma.outreachAssignment.findFirst({
      where: { projectId, globalRecordId },
      include: { assignee: { select: { id: true, name: true, image: true } } },
    }),
    // Any e-mail we've ever sent this partner in this project — via this workspace,
    // the negotiations page, or discovered by Gmail sync — counts as active
    // communication, regardless of whether an outreach draft was ever generated.
    prisma.email.count({
      where: { negotiation: { projectId, globalRecordId }, direction: 'SENT' },
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
    profileData: (alignment?.profileSnapshot as Record<string, unknown> | null) ?? (globalRecord.payload as Record<string, unknown>),
    alignment,
    draft,
    assignment,
    hasActiveCommunication: sentEmailCount > 0,
  }
})
