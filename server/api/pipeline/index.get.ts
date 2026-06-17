import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const groupId = await getActiveGroupId(event)

  const runs = await prisma.pipelineRun.findMany({
    where: groupId ? { groupId } : undefined,
    include: {
      author: { select: { id: true, name: true, image: true } },
      steps: {
        select: { stepType: true, status: true, outputData: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return runs.map(run => {
    // Latest completed step per type (asc order → last wins)
    const latest = new Map<string, typeof run.steps[0]>()
    for (const s of run.steps) {
      if (s.status === 'COMPLETED') latest.set(s.stepType, s)
    }

    function arrayCount(stepType: string): number | null {
      const s = latest.get(stepType)
      if (!s) return null
      return Array.isArray(s.outputData) ? s.outputData.length : null
    }

    function partnerCount(): number | null {
      const s = latest.get('PARTNER_IDENTIFICATION')
      if (!s) return null
      const data = s.outputData as { items?: Array<{ partners?: Array<{ partnerId?: string; name?: string }> }> } | null
      if (!data?.items) return null
      const seen = new Set<string>()
      for (const item of data.items) {
        for (const p of item.partners ?? []) {
          const key = p.partnerId ?? p.name?.toLowerCase()
          if (key) seen.add(key)
        }
      }
      return seen.size
    }

    const sentCount = run.steps.filter(
      s => s.stepType === 'OUTREACH_EXECUTION' && s.status === 'COMPLETED',
    ).length

    return {
      id: run.id,
      name: run.name,
      createdAt: run.createdAt,
      author: run.author,
      stats: {
        competitions: arrayCount('MARKET_SCANNING'),
        partners: partnerCount(),
        profiles: arrayCount('PARTNER_PROFILING'),
        alignments: arrayCount('VALUE_ALIGNMENT'),
        outreach: arrayCount('OUTREACH_PREPARATION'),
        sent: sentCount > 0 ? sentCount : null,
      },
    }
  })
})
