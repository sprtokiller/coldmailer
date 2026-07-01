/**
 * GET /api/projects/[projectId]/outreach/partners
 *
 * Vrátí všechny GlobalRecordy asociované s tímto projektem – bez závislosti
 * na konkrétním kroku pipeline. Zahrnuje záznamy nalezené přes PipelineRecordRef
 * (jakýkoli krok v jakémkoli PipelineRun projektu) i přes ProjectRecord.
 *
 * Každý záznam obsahuje stav PartnerAlignment a PartnerOutreachDraft.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  await requireProjectAccess(event, projectId)

  const access = await getInteractionAccess(user.id, projectId)
  const canManageAll = access.isAdmin || access.canEditAll

  const projectRecords = await prisma.projectRecord.findMany({
    where: { projectId },
    select: { globalRecordId: true },
  })

  const globalRecordIds = [...new Set(projectRecords.map(r => r.globalRecordId))]

  if (globalRecordIds.length === 0) return { partners: [], canManageAll }

  const [globalRecords, alignments, drafts, assignments] = await Promise.all([
    prisma.globalRecord.findMany({
      where: { id: { in: globalRecordIds } },
      include: {
        contacts: {
          where: { address: { contains: '@' } },
          orderBy: [{ isPrimary: 'desc' }, { priority: 'asc' }],
          select: { id: true, address: true, label: true, firstName: true, lastName: true, role: true, contactType: true, priority: true, isPrimary: true },
        },
      },
      orderBy: { canonicalName: 'asc' },
    }),
    prisma.partnerAlignment.findMany({
      where: { projectId, globalRecordId: { in: globalRecordIds } },
      select: { globalRecordId: true, createdAt: true, updatedAt: true, author: { select: { name: true } } },
    }),
    prisma.partnerOutreachDraft.findMany({
      where: { projectId, globalRecordId: { in: globalRecordIds } },
      select: { globalRecordId: true, savedAt: true, sentAt: true, sendError: true, toAddress: true, subject: true, savedBy: { select: { name: true } } },
    }),
    prisma.outreachAssignment.findMany({
      where: { projectId, globalRecordId: { in: globalRecordIds } },
      select: { globalRecordId: true, assigneeId: true, assignee: { select: { id: true, name: true, image: true } } },
    }),
  ])

  const alignmentMap = new Map(alignments.map(a => [a.globalRecordId, a]))
  const draftMap = new Map(drafts.map(d => [d.globalRecordId, d]))
  const assignmentMap = new Map(assignments.map(a => [a.globalRecordId, a]))

  const partners = globalRecords.map(gr => ({
    id: gr.id,
    canonicalName: gr.canonicalName,
    type: gr.type,
    payload: gr.payload,
    contacts: gr.contacts,
    alignment: alignmentMap.get(gr.id) ?? null,
    draft: draftMap.get(gr.id) ?? null,
    assignment: assignmentMap.get(gr.id) ?? null,
  }))

  return { partners, canManageAll }
})
