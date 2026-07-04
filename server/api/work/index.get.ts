/**
 * GET /api/work
 *
 * Přehled práce pro záložku Práce: běžící a nedávno dokončené úlohy z work
 * registru + naplánované e-maily z DB (PENDING/SENDING/FAILED). Běžný uživatel
 * vidí jen svou práci, admin všechno.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { listWork } from '~/server/utils/work-registry'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const jobs = listWork(user.id, user.isAdmin)

  const scheduledEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: { in: ['PENDING', 'SENDING', 'FAILED'] },
      ...(user.isAdmin ? {} : { createdById: user.id }),
    },
    orderBy: { scheduledFor: 'asc' },
    take: 100,
    select: {
      id: true,
      toAddress: true,
      subject: true,
      scheduledFor: true,
      status: true,
      errorMessage: true,
      createdAt: true,
      globalRecordId: true,
      globalRecord: { select: { canonicalName: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  // Jména vlastníků úloh pro admin pohled (registr drží jen userId)
  const userIds = [...new Set(jobs.map(j => j.userId))]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const userNames = Object.fromEntries(users.map(u => [u.id, u.name]))

  return {
    jobs: jobs.map(j => ({ ...j, userName: userNames[j.userId] ?? null })),
    scheduledEmails,
    isAdmin: user.isAdmin,
    now: Date.now(),
  }
})
