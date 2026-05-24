import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const STEP_LABELS: Record<string, string> = {
  MARKET_SCANNING: 'Market Scanning',
  PARTNER_IDENTIFICATION: 'Identifikace partnerů',
  PARTNER_PROFILING: 'Profilování partnerů',
  VALUE_ALIGNMENT: 'Value Alignment',
  OUTREACH_PREPARATION: 'Příprava oslovení',
  OUTREACH_EXECUTION: 'Odeslání oslovení',
}

const STEP_ORDER = [
  'MARKET_SCANNING',
  'PARTNER_IDENTIFICATION',
  'PARTNER_PROFILING',
  'VALUE_ALIGNMENT',
  'OUTREACH_PREPARATION',
  'OUTREACH_EXECUTION',
]

// Counts from outputData when no PipelineRecordRefs exist yet (legacy runs)
function countsFromOutputData(stepType: string, outputData: unknown) {
  if (!outputData) return null

  if (stepType === 'MARKET_SCANNING') {
    const items = Array.isArray(outputData) ? outputData : []
    const total = items.length
    return total > 0 ? { relevant: 0, irrelevant: 0, uncertain: total, total } : null
  }

  if (stepType === 'PARTNER_IDENTIFICATION') {
    const items = (outputData as { items?: unknown[] } | null)?.items ?? []
    const partnerIds = new Set<string>()
    for (const item of items) {
      const partners = (item as { partners?: Array<{ partnerId: string }> })?.partners ?? []
      for (const p of partners) if (p.partnerId) partnerIds.add(p.partnerId)
    }
    const total = partnerIds.size
    return total > 0 ? { relevant: 0, irrelevant: 0, uncertain: total, total } : null
  }

  if (stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT' || stepType === 'OUTREACH_PREPARATION') {
    const arr = Array.isArray(outputData) ? outputData : []
    const total = arr.length
    return total > 0 ? { relevant: 0, irrelevant: 0, uncertain: total, total } : null
  }

  if (stepType === 'OUTREACH_EXECUTION') {
    const obj = outputData as Record<string, unknown> | null
    const total = (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.gmailDraftId) ? 1 : 0
    return total > 0 ? { relevant: 0, irrelevant: 0, uncertain: 0, total } : null
  }

  return null
}

function selectedCountFromOutputData(stepType: string, outputData: unknown): number {
  const counts = countsFromOutputData(stepType, outputData)
  return counts?.total ?? 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')!

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { createdAt: 'desc' },
        include: {
          inputSources: true,
          recordRefs: {
            include: { globalRecord: { select: { id: true, relevanceStatus: true } } },
          },
        },
      },
    },
  })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })

  // Latest step per type
  const latestByType = new Map<string, typeof run.steps[0]>()
  for (const step of run.steps) {
    if (!latestByType.has(step.stepType)) latestByType.set(step.stepType, step)
  }

  const nodes = STEP_ORDER.map((stepType, i) => {
    const step = latestByType.get(stepType)
    const refs = step?.recordRefs ?? []

    let recordCounts: { relevant: number; irrelevant: number; uncertain: number; total: number }
    let sources = step?.inputSources ?? []

    if (refs.length > 0) {
      recordCounts = {
        relevant: refs.filter(r => r.globalRecord.relevanceStatus === 'RELEVANT').length,
        irrelevant: refs.filter(r => r.globalRecord.relevanceStatus === 'IRRELEVANT').length,
        uncertain: refs.filter(r => r.globalRecord.relevanceStatus === 'UNCERTAIN').length,
        total: refs.length,
      }
    } else {
      // Fallback: derive counts from outputData for legacy runs
      const legacy = step ? countsFromOutputData(stepType, step.outputData) : null
      recordCounts = legacy ?? { relevant: 0, irrelevant: 0, uncertain: 0, total: 0 }

      // Synthetic source label so the node doesn't look empty
      if (legacy && sources.length === 0) {
        sources = [{
          id: `legacy-${step!.id}`,
          type: 'MINI_DEEP_RESEARCH' as const,
          label: `Výsledky z ${new Date(step!.createdAt).toLocaleDateString('cs-CZ')}`,
          createdAt: step!.createdAt,
        }] as typeof sources
      }
    }

    const isCanvas = stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION'
    return {
      id: `step-${stepType}`,
      type: isCanvas ? (stepType === 'MARKET_SCANNING' ? 'marketScanning' : 'partnerIdentification') : 'placeholder',
      position: { x: i * 340, y: 0 },
      data: {
        stepId: step?.id ?? null,
        stepType,
        label: STEP_LABELS[stepType] ?? stepType,
        status: step?.status ?? 'PENDING',
        recordCounts,
        sources,
      },
    }
  })

  const edges = STEP_ORDER.slice(0, -1).map((stepType, i) => {
    const nextType = STEP_ORDER[i + 1]
    const step = latestByType.get(stepType)
    const nextStep = latestByType.get(nextType)
    const refs = step?.recordRefs ?? []

    let flowCount = 0
    if (refs.length > 0) {
      // Modern GlobalRecord flow: selected refs from source step
      flowCount = refs.filter(r => r.isSelectedForProcessing).length
    } else if (step) {
      const isEarly = stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION'
      if (isEarly) {
        // Steps 1-2: derive from source's own outputData
        flowCount = selectedCountFromOutputData(stepType, step.outputData)
      } else if (nextStep) {
        // Steps 3-5: best proxy is target step's output count (what actually got processed)
        flowCount = selectedCountFromOutputData(nextType, nextStep.outputData)
      }
    }

    return {
      id: `e-${stepType}-${nextType}`,
      source: `step-${stepType}`,
      target: `step-${nextType}`,
      label: flowCount > 0 ? `${flowCount} záznamů` : '',
    }
  })

  return { nodes, edges }
})
