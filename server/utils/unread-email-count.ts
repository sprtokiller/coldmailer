import { prisma } from '~/server/utils/prisma'

// Počet nepřečtených e-mailů v jednáních, kde je uživatel oslovovatel (OutreachAssignment)
// nebo řešitel jednání (NegotiationAssignee). Bez projectId napříč všemi projekty.
export async function getUnreadCountForUser(userId: string, projectId?: string): Promise<number> {
  const [outreach, negotiationAssignments] = await Promise.all([
    prisma.outreachAssignment.findMany({
      where: { assigneeId: userId, ...(projectId ? { projectId } : {}) },
      select: { projectId: true, globalRecordId: true },
    }),
    prisma.negotiationAssignee.findMany({
      where: { userId, ...(projectId ? { projectId } : {}) },
      select: { projectId: true, globalRecordId: true },
    }),
  ])

  const pairs = [...outreach, ...negotiationAssignments]
  if (pairs.length === 0) return 0

  const uniquePairs = [...new Map(pairs.map(p => [`${p.projectId}:${p.globalRecordId}`, p])).values()]

  return prisma.email.count({
    where: {
      isRead: false,
      negotiation: { OR: uniquePairs.map(p => ({ projectId: p.projectId, globalRecordId: p.globalRecordId })) },
    },
  })
}
