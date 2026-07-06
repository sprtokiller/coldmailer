import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = query.search as string | undefined
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  const negotiationWhere = projectId ? { projectId, removedAt: null } : { removedAt: null }

  const records = await prisma.globalRecord.findMany({
    where: {
      type: 'PARTNER',
      ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
      negotiations: {
        some: {
          ...negotiationWhere,
          OR: [
            { emails: { some: {} } },
            { notes: { some: {} } },
            { myToThem: { not: null } },
            { themToUs: { not: null } },
          ],
        },
      },
    },
    include: {
      contacts: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
      negotiations: {
        where: negotiationWhere,
        select: {
          negotiationStatus: true,
          emails: { select: { sentAt: true }, orderBy: { sentAt: 'desc' }, take: 1 },
          notes: { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
          _count: { select: { emails: true } },
        },
      },
      negotiationAssignees: {
        where: projectId ? { projectId } : undefined,
        select: { user: { select: { id: true, name: true, image: true } } },
      },
    },
    orderBy: { canonicalName: 'asc' },
  })

  return records.map((r) => {
    const negotiation = r.negotiations[0] ?? null
    const lastEmailAt = negotiation?.emails[0]?.sentAt ?? null
    const lastNoteAt = negotiation?.notes[0]?.updatedAt ?? null
    const lastInteractionAt = lastEmailAt && lastNoteAt
      ? (lastEmailAt > lastNoteAt ? lastEmailAt : lastNoteAt)
      : (lastEmailAt ?? lastNoteAt ?? null)

    return {
      id: r.id,
      type: r.type,
      canonicalName: r.canonicalName,
      normalizedName: r.normalizedName,
      payload: r.payload,
      contacts: r.contacts,
      assignees: r.negotiationAssignees.map(a => a.user),
      lastInteractionAt,
      interactionCount: negotiation?._count.emails ?? 0,
      negotiationStatus: negotiation?.negotiationStatus ?? null,
      inProject: !!negotiation,
    }
  })
})
