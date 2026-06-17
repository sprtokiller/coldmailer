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

  // Pre-compute MS extra nodes — always emit both regardless of record count
  const msStep = latestByType.get('MARKET_SCANNING')
  const allMsRefs = msStep?.recordRefs ?? []
  const allMsSources = msStep?.inputSources ?? []

  // IMPORTED: count by addMethod (each AI import run has its own AI_IMPORT InputSource)
  const importedRefs = allMsRefs.filter(r => r.addMethod === 'IMPORTED')
  const importedSources = allMsSources.filter(s => s.type === 'AI_IMPORT')

  // GLOBAL_DB: count by InputSource to stay in sync with how the overlay groups records
  const globalDbSource = allMsSources.find(s => s.type === 'GLOBAL_DB_SELECT')
  const globalDbRefs = globalDbSource
    ? allMsRefs.filter(r => r.inputSourceId === globalDbSource.id)
    : []

  const msExtras = [
    {
      nodeId: 'ms-imported',
      label: 'Importované',
      method: 'IMPORTED',
      sources: importedSources,
      total: importedRefs.length,
      selected: importedRefs.filter(r => r.isSelectedForProcessing).length,
    },
    {
      nodeId: 'ms-globaldb',
      label: 'Z databáze',
      method: 'GLOBAL_DB',
      sources: globalDbSource ? [globalDbSource] : [],
      total: globalDbRefs.length,
      selected: globalDbRefs.filter(r => r.isSelectedForProcessing).length,
    },
  ]

  // Pre-compute PI extra nodes — same pattern as MS
  const piStep = latestByType.get('PARTNER_IDENTIFICATION')
  const allPiRefs = piStep?.recordRefs ?? []
  const allPiSources = piStep?.inputSources ?? []

  const piImportedRefs = allPiRefs.filter(r => r.addMethod === 'IMPORTED')
  const piImportedSources = allPiSources.filter(s => s.type === 'AI_IMPORT')

  const piGlobalDbSource = allPiSources.find(s => s.type === 'GLOBAL_DB_SELECT')
  const piGlobalDbRefs = piGlobalDbSource
    ? allPiRefs.filter(r => r.inputSourceId === piGlobalDbSource.id)
    : []

  const piExtras = [
    {
      nodeId: 'pi-imported',
      label: 'Importované',
      method: 'IMPORTED',
      sources: piImportedSources,
      total: piImportedRefs.length,
      selected: piImportedRefs.filter(r => r.isSelectedForProcessing).length,
    },
    {
      nodeId: 'pi-globaldb',
      label: 'Z databáze',
      method: 'GLOBAL_DB',
      sources: piGlobalDbSource ? [piGlobalDbSource] : [],
      total: piGlobalDbRefs.length,
      selected: piGlobalDbRefs.filter(r => r.isSelectedForProcessing).length,
    },
  ]

  // MS and PI head their own input-source columns at y=0; the rest of the flow sits one row below
  const flowY = Y_SPACING

  const nodes = STEP_ORDER.map((stepType, i) => {
    const step = latestByType.get(stepType)
    // Exclude IMPORTED/GLOBAL_DB from the main MS/PI node — those get their own nodes
    const allRefs = step?.recordRefs ?? []
    const refs = (stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION')
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
      // Badge: unique AI-identified competitions across ALL MS runs (each run = its own PipelineStep)
      const allMsGeneratedRefs = run.steps
        .filter(s => s.stepType === 'MARKET_SCANNING')
        .flatMap(s => s.recordRefs.filter(r => r.addMethod !== 'IMPORTED' && r.addMethod !== 'GLOBAL_DB'))
      if (allMsGeneratedRefs.length > 0) {
        recordCounts = { total: allMsGeneratedRefs.length }
      }
    }

    // For the main PI node, show only AI-run sources; AI_IMPORT / GLOBAL_DB_SELECT belong to extra nodes
    if (stepType === 'PARTNER_IDENTIFICATION') {
      sources = sources.filter(s => s.type === 'MINI_DEEP_RESEARCH') as typeof sources
    }

    const isCanvas = stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION'
    return {
      id: `step-${stepType}`,
      type: isCanvas ? (stepType === 'MARKET_SCANNING' ? 'marketScanning' : 'partnerIdentification') : 'placeholder',
      // MS and PI at y=0 (top row); following steps offset below by one source-row gap
      position: { x: i * 340, y: isCanvas ? 0 : flowY },
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
    // Same IMPORTED/GLOBAL_DB exclusion for the MS→PI and PI→PP edge labels
    const allRefs = step?.recordRefs ?? []
    const refs = (stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION')
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
    } else if (stepType === 'PARTNER_IDENTIFICATION' && refs.length > 0) {
      label = `${flowCount} / ${refs.length} partnerů`
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

  // PP→VA edge: progress chart (total input partners vs profiled)
  const ppVaEdge = edges.find(e => e.id === 'e-PARTNER_PROFILING-VALUE_ALIGNMENT')
  const ppStep = latestByType.get('PARTNER_PROFILING')
  const ppOutputCount = ppStep && Array.isArray(ppStep.outputData) ? (ppStep.outputData as unknown[]).length : 0
  if (ppVaEdge) {
    const piAllSelected = allPiRefs.filter(r => r.isSelectedForProcessing).length
    ppVaEdge.label = piAllSelected > 0 ? `${ppOutputCount}/${piAllSelected} profilů` : ''
    ;(ppVaEdge as typeof ppVaEdge & { progressData?: unknown }).progressData = {
      total: piAllSelected,
      completed: ppOutputCount,
      completedLabel: 'Zprofilováno',
      remainingLabel: 'Čeká na profilování',
    }
  }

  // VA→OP edge: progress chart (profiled partners vs aligned)
  const vaOpEdge = edges.find(e => e.id === 'e-VALUE_ALIGNMENT-OUTREACH_PREPARATION')
  if (vaOpEdge) {
    const vaStep = latestByType.get('VALUE_ALIGNMENT')
    const vaOutputCount = vaStep && Array.isArray(vaStep.outputData) ? (vaStep.outputData as unknown[]).length : 0
    vaOpEdge.label = ppOutputCount > 0 ? `${vaOutputCount}/${ppOutputCount} alignmentů` : ''
    ;(vaOpEdge as typeof vaOpEdge & { progressData?: unknown }).progressData = {
      total: ppOutputCount,
      completed: vaOutputCount,
      completedLabel: 'Zpracováno',
      remainingLabel: 'Čeká na zpracování',
    }
  }

  // Extra input-source nodes for MS IMPORTED / GLOBAL_DB records — always emitted (even with 0 records)
  msExtras.forEach((extra, j) => {
    nodes.push({
      id: extra.nodeId,
      type: 'msInputSource',
      position: { x: 0, y: (j + 1) * Y_SPACING },
      data: {
        stepId: msStep?.id ?? null,
        stepType: 'MARKET_SCANNING',
        label: extra.label,
        status: 'COMPLETED',
        recordCounts: { total: extra.total },
        sources: extra.sources,
        addMethod: extra.method,
        total: extra.total,
        selected: extra.selected,
      },
    })
    edges.push({
      id: `e-${extra.nodeId}-pi`,
      source: extra.nodeId,
      target: 'step-PARTNER_IDENTIFICATION',
      label: extra.total > 0 ? `${extra.selected} / ${extra.total} soutěží` : '',
    })
  })

  // Extra input-source nodes for PI IMPORTED / GLOBAL_DB records — feed directly into PARTNER_PROFILING
  piExtras.forEach((extra, j) => {
    nodes.push({
      id: extra.nodeId,
      type: 'piInputSource',
      position: { x: 340, y: (j + 1) * Y_SPACING },
      data: {
        stepId: piStep?.id ?? null,
        stepType: 'PARTNER_IDENTIFICATION',
        label: extra.label,
        status: 'COMPLETED',
        recordCounts: { total: extra.total },
        sources: extra.sources,
        addMethod: extra.method,
        total: extra.total,
        selected: extra.selected,
      },
    })
    edges.push({
      id: `e-${extra.nodeId}-pp`,
      source: extra.nodeId,
      target: 'step-PARTNER_PROFILING',
      label: extra.total > 0 ? `${extra.selected} / ${extra.total} partnerů` : '',
    })
  })

  return { nodes, edges }
})
