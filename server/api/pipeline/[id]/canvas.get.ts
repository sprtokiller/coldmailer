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
    const total = Array.isArray(outputData) ? outputData.length : 0
    return total > 0 ? { total } : null
  }

  if (stepType === 'PARTNER_IDENTIFICATION') {
    const items = (outputData as { items?: unknown[] } | null)?.items ?? []
    const partnerIds = new Set<string>()
    for (const item of items) {
      const partners = (item as { partners?: Array<{ partnerId: string }> })?.partners ?? []
      for (const p of partners) if (p.partnerId) partnerIds.add(p.partnerId)
    }
    const total = partnerIds.size
    return total > 0 ? { total } : null
  }

  if (stepType === 'PARTNER_PROFILING' || stepType === 'VALUE_ALIGNMENT' || stepType === 'OUTREACH_PREPARATION') {
    const total = Array.isArray(outputData) ? outputData.length : 0
    return total > 0 ? { total } : null
  }

  if (stepType === 'OUTREACH_EXECUTION') {
    const obj = outputData as Record<string, unknown> | null
    const total = (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.gmailDraftId) ? 1 : 0
    return total > 0 ? { total } : null
  }

  return null
}

function selectedCountFromOutputData(stepType: string, outputData: unknown): number {
  const counts = countsFromOutputData(stepType, outputData)
  return counts?.total ?? 0
}

const MS_EXTRA_METHODS = [
  { method: 'IMPORTED',   label: 'Importované' },
  { method: 'GLOBAL_DB',  label: 'Z databáze' },
] as const

const Y_SPACING = 180

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
          recordRefs: true,
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

  // Pre-compute MS extra nodes (IMPORTED / GLOBAL_DB) — always emit both regardless of record count
  const msStep = latestByType.get('MARKET_SCANNING')
  const msExtras = MS_EXTRA_METHODS.map(({ method, label }) => {
    const matching = msStep?.recordRefs.filter(r => r.addMethod === method) ?? []
    return { method, label, total: matching.length, selected: matching.filter(r => r.isSelectedForProcessing).length }
  })

  // Shift the main flow down so it's vertically centred beside the MS column
  const centerY = Math.round((msExtras.length * Y_SPACING) / 2)

  const nodes = STEP_ORDER.map((stepType, i) => {
    const step = latestByType.get(stepType)
    // Exclude IMPORTED/GLOBAL_DB from the main MS node — those get their own nodes
    const allRefs = step?.recordRefs ?? []
    const refs = stepType === 'MARKET_SCANNING'
      ? allRefs.filter(r => r.addMethod !== 'IMPORTED' && r.addMethod !== 'GLOBAL_DB')
      : allRefs

    let recordCounts: { total: number }
    let sources = step?.inputSources ?? []
    let selectedCount = 0

    if (refs.length > 0) {
      selectedCount = refs.filter(r => r.isSelectedForProcessing).length
      recordCounts = { total: refs.length }
    } else {
      // Fallback: derive counts from outputData for legacy runs (MS skipped — requires real refs)
      const legacy = (stepType !== 'MARKET_SCANNING' && step) ? countsFromOutputData(stepType, step.outputData) : null
      recordCounts = legacy ?? { total: 0 }

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

    // For the main MS node, show only AI-run sources; AI_IMPORT sources belong to the IMPORTED extra node
    if (stepType === 'MARKET_SCANNING') {
      sources = sources.filter(s => s.type === 'MINI_DEEP_RESEARCH') as typeof sources
    }

    const isCanvas = stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION'
    return {
      id: `step-${stepType}`,
      type: isCanvas ? (stepType === 'MARKET_SCANNING' ? 'marketScanning' : 'partnerIdentification') : 'placeholder',
      // MS always at y=0; everything else vertically centred beside it
      position: { x: i * 340, y: stepType === 'MARKET_SCANNING' ? 0 : centerY },
      data: {
        stepId: step?.id ?? null,
        stepType,
        label: STEP_LABELS[stepType] ?? stepType,
        status: step?.status ?? 'PENDING',
        recordCounts,
        selected: selectedCount,
        sources,
      },
    }
  })

  const EDGE_FLOW_LABELS: Record<string, string> = {
    MARKET_SCANNING:        'soutěží',
    PARTNER_IDENTIFICATION: 'partnerů',
    PARTNER_PROFILING:      'profilů',
    VALUE_ALIGNMENT:        'alignmentů',
    OUTREACH_PREPARATION:   'e-mailů',
  }

  const edges = STEP_ORDER.slice(0, -1).map((stepType, i) => {
    const nextType = STEP_ORDER[i + 1]
    const step = latestByType.get(stepType)
    const nextStep = latestByType.get(nextType)
    // Same IMPORTED/GLOBAL_DB exclusion for the MS→PI edge label
    const allRefs = step?.recordRefs ?? []
    const refs = stepType === 'MARKET_SCANNING'
      ? allRefs.filter(r => r.addMethod !== 'IMPORTED' && r.addMethod !== 'GLOBAL_DB')
      : allRefs

    let flowCount = 0
    if (refs.length > 0) {
      flowCount = refs.filter(r => r.isSelectedForProcessing).length
    } else if (step && stepType !== 'MARKET_SCANNING') {
      const isEarly = stepType === 'PARTNER_IDENTIFICATION'
      if (isEarly) {
        flowCount = selectedCountFromOutputData(stepType, step.outputData)
      } else if (nextStep) {
        flowCount = selectedCountFromOutputData(nextType, nextStep.outputData)
      }
    }

    let label: string
    if (stepType === 'MARKET_SCANNING') {
      label = refs.length > 0 ? `${flowCount} / ${refs.length} soutěží` : ''
    } else {
      label = flowCount > 0 ? `${flowCount} ${EDGE_FLOW_LABELS[stepType] ?? 'záznamů'}` : ''
    }

    return {
      id: `e-${stepType}-${nextType}`,
      source: `step-${stepType}`,
      target: `step-${nextType}`,
      label,
    }
  })

  // Extra input-source nodes for MS IMPORTED / GLOBAL_DB records — always emitted (even with 0 records)
  msExtras.forEach((extra, j) => {
    const nodeId = `ms-${extra.method === 'IMPORTED' ? 'imported' : 'globaldb'}`
    // AI_IMPORT InputSources (one per import run) power the clickable items on the IMPORTED node
    const extraSources = extra.method === 'IMPORTED'
      ? (msStep?.inputSources ?? []).filter(s => s.type === 'AI_IMPORT')
      : []
    nodes.push({
      id: nodeId,
      type: 'msInputSource',
      position: { x: 0, y: (j + 1) * Y_SPACING },
      data: {
        stepId: msStep?.id ?? null,
        stepType: 'MARKET_SCANNING',
        label: extra.label,
        status: 'COMPLETED',
        recordCounts: { total: extra.total },
        sources: extraSources,
        addMethod: extra.method,
        total: extra.total,
        selected: extra.selected,
      },
    })
    edges.push({
      id: `e-${nodeId}-pi`,
      source: nodeId,
      target: 'step-PARTNER_IDENTIFICATION',
      label: extra.total > 0 ? `${extra.selected} / ${extra.total} soutěží` : '',
    })
  })

  return { nodes, edges }
})
