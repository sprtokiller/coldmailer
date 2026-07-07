/**
 * GET /api/projects/[projectId]/outreach/partners
 *
 * Vrátí všechny GlobalRecordy asociované s tímto projektem – bez závislosti
 * na konkrétním kroku pipeline. Zahrnuje záznamy nalezené přes Negotiation
 * (e-maily/poznámky/plnění vždy vyžadují existující Negotiation, takže její
 * existence sama o sobě znamená "partner má v projektu nějakou aktivitu"),
 * kromě těch, které byly z projektu odebrány (removedAt).
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

  const negotiations = await prisma.negotiation.findMany({
    where: { projectId, removedAt: null },
    select: {
      globalRecordId: true,
      manuallyAddedAt: true,
      myToThem: true,
      themToUs: true,
      _count: { select: { emails: true, notes: true } },
    },
  })
  const globalRecordIds = [...new Set(negotiations.map(n => n.globalRecordId))]

  if (globalRecordIds.length === 0) return { partners: [], canManageAll }

  const [globalRecords, alignments, drafts, assignments, sentEmails] = await Promise.all([
    prisma.globalRecord.findMany({
      where: { id: { in: globalRecordIds } },
      include: {
        contacts: {
          where: { address: { contains: '@' } },
          orderBy: [{ priority: 'asc' }],
          select: { id: true, address: true, label: true, firstName: true, lastName: true, role: true, contactType: true, priority: true },
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
    // Any e-mail we've ever sent this partner in this project — via this workspace,
    // the negotiations page, or discovered by Gmail sync — counts as active
    // communication, regardless of whether an outreach draft was ever generated.
    prisma.email.findMany({
      where: { negotiation: { projectId, globalRecordId: { in: globalRecordIds } }, direction: 'SENT' },
      select: { negotiation: { select: { globalRecordId: true } } },
      distinct: ['negotiationId'],
    }),
  ])

  const alignmentMap = new Map(alignments.map(a => [a.globalRecordId, a]))
  const draftMap = new Map(drafts.map(d => [d.globalRecordId, d]))
  const assignmentMap = new Map(assignments.map(a => [a.globalRecordId, a]))
  const sentEmailSet = new Set(sentEmails.map(e => e.negotiation.globalRecordId))
  // Same "counts as a real negotiation" criteria as /api/partners — an e-mail, a
  // note, fulfillment content, or a manual add, none of which require each other.
  const negotiationSet = new Set(
    negotiations
      .filter(n => n._count.emails > 0 || n._count.notes > 0 || n.myToThem !== null || n.themToUs !== null || n.manuallyAddedAt !== null)
      .map(n => n.globalRecordId),
  )

  const partners = globalRecords.map(gr => ({
    id: gr.id,
    canonicalName: gr.canonicalName,
    type: gr.type,
    payload: gr.payload,
    contacts: gr.contacts,
    alignment: alignmentMap.get(gr.id) ?? null,
    draft: draftMap.get(gr.id) ?? null,
    assignment: assignmentMap.get(gr.id) ?? null,
    hasActiveCommunication: sentEmailSet.has(gr.id),
    hasNegotiation: negotiationSet.has(gr.id),
  }))

  return { partners, canManageAll }
})
