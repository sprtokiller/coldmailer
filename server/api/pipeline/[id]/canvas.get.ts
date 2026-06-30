import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

const STEP_LABELS: Record<string, string> = {
  MARKET_SCANNING: 'Market Scanning',
  PARTNER_IDENTIFICATION: 'Identifikace partnerů',
  PARTNER_PROFILING: 'Profilování partnerů',
  VALUE_ALIGNMENT: 'Value Alignment',
  OUTREACH_PREPARATION: 'Příprava oslovení',
}

const STEP_ORDER = [
  'MARKET_SCANNING',
  'PARTNER_IDENTIFICATION',
  'PARTNER_PROFILING',
  'VALUE_ALIGNMENT',
  'OUTREACH_PREPARATION',
]

function countsFromOutputData(stepType: string, outputData: unknown) {
  if (!outputData) return null

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

  return null
}

function selectedCountFromOutputData(stepType: string, outputData: unknown): number {
  const counts = countsFromOutputData(stepType, outputData)
  return counts?.total ?? 0
}

// MS counts based on outputData + selectionData (competitions are no longer in GlobalRecord)
function msCounts(outputData: unknown, selectionData: unknown) {
  const total = Array.isArray(outputData) ? (outputData as unknown[]).length : 0
  const selected = Array.isArray(selectionData) ? (selectionData as unknown[]).length : total
  return { total, selected }
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
  if (!run) throw createError({ statusCode: 404, message: 'Run not found' })

  // Latest step per type
  const latestByType = new Map<string, typeof run.steps[0]>()
  for (const step of run.steps) {
    if (!latestByType.has(step.stepType)) latestByType.set(step.stepType, step)
  }

  // Pre-compute PI extra nodes — imported/global-db partners
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

  const isShort = run.mode === 'short'

  const activeStepOrder = isShort
    ? STEP_ORDER.filter(s => s !== 'MARKET_SCANNING' && s !== 'PARTNER_IDENTIFICATION')
    : STEP_ORDER

  const flowY = Y_SPACING
  const flowXOffset = isShort ? 340 : 0

  const nodes = activeStepOrder.map((stepType, i) => {
    const step = latestByType.get(stepType)

    // MS: counts from outputData/selectionData — no GlobalRecord refs for competitions
    if (stepType === 'MARKET_SCANNING') {
      const { total, selected } = msCounts(step?.outputData, (step as any)?.selectionData)
      return {
        id: `step-${stepType}`,
        type: 'marketScanning',
        position: { x: i * 340, y: 0 },
        data: {
          stepId: step?.id ?? null,
          stepType,
          label: STEP_LABELS[stepType],
          status: step?.status ?? 'PENDING',
          recordCounts: { total },
          selected,
          sources: [],
        },
      }
    }

    // PI: exclude IMPORTED/GLOBAL_DB from main node
    const allRefs = step?.recordRefs ?? []
    const refs = stepType === 'PARTNER_IDENTIFICATION'
      ? allRefs.filter(r => r.addMethod !== 'IMPORTED' && r.addMethod !== 'GLOBAL_DB')
      : allRefs

    let recordCounts: { total: number }
    let sources = step?.inputSources ?? []
    let selectedCount = 0

    if (refs.length > 0) {
      selectedCount = refs.filter(r => r.isSelectedForProcessing).length
      recordCounts = { total: refs.length }
    } else {
      const legacy = step ? countsFromOutputData(stepType, step.outputData) : null
      recordCounts = legacy ?? { total: 0 }

      if (legacy && sources.length === 0) {
        sources = [{
          id: `legacy-${step!.id}`,
          type: 'AI_IMPORT' as const,
          label: `Výsledky z ${new Date(step!.createdAt).toLocaleDateString('cs-CZ')}`,
          createdAt: step!.createdAt,
        }] as typeof sources
      }
    }

    if (stepType === 'PARTNER_IDENTIFICATION') {
      sources = sources.filter(s => s.type === 'AI_IMPORT') as typeof sources
    }

    const isCanvas = stepType === 'PARTNER_IDENTIFICATION'
    return {
      id: `step-${stepType}`,
      type: isCanvas ? 'partnerIdentification' : 'placeholder',
      position: isShort
        ? { x: flowXOffset + i * 340, y: 0 }
        : { x: i * 340, y: isCanvas ? 0 : flowY },
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

  const msStep = latestByType.get('MARKET_SCANNING')

  const edges = activeStepOrder.slice(0, -1).map((stepType, i) => {
    const nextType = activeStepOrder[i + 1]
    const step = latestByType.get(stepType)
    const nextStep = latestByType.get(nextType)

    let flowCount = 0
    let label = ''

    if (stepType === 'MARKET_SCANNING') {
      const { total, selected } = msCounts(step?.outputData, (step as any)?.selectionData)
      label = total > 0 ? `${selected} / ${total} soutěží` : ''
      flowCount = selected
    } else {
      const allRefs = step?.recordRefs ?? []
      const refs = stepType === 'PARTNER_IDENTIFICATION'
        ? allRefs.filter(r => r.addMethod !== 'IMPORTED' && r.addMethod !== 'GLOBAL_DB')
        : allRefs

      if (refs.length > 0) {
        flowCount = refs.filter(r => r.isSelectedForProcessing).length
        if (stepType === 'PARTNER_IDENTIFICATION') {
          label = `${flowCount} / ${refs.length} partnerů`
        } else {
          label = flowCount > 0 ? `${flowCount} ${EDGE_FLOW_LABELS[stepType] ?? 'záznamů'}` : ''
        }
      } else if (step) {
        const isEarly = stepType === 'PARTNER_IDENTIFICATION'
        if (isEarly) {
          flowCount = selectedCountFromOutputData(stepType, step.outputData)
        } else if (nextStep) {
          flowCount = selectedCountFromOutputData(nextType, nextStep.outputData)
        }
        label = flowCount > 0 ? `${flowCount} ${EDGE_FLOW_LABELS[stepType] ?? 'záznamů'}` : ''
      }
    }

    return {
      id: `e-${stepType}-${nextType}`,
      source: `step-${stepType}`,
      target: `step-${nextType}`,
      label,
    }
  })

  // PP→VA edge: progress chart
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

  // VA→OP edge: progress chart
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

  // Extra input-source nodes for PI IMPORTED / GLOBAL_DB records
  piExtras.forEach((extra, j) => {
    nodes.push({
      id: extra.nodeId,
      type: 'piInputSource',
      position: isShort
        ? { x: 0, y: j * Y_SPACING }
        : { x: 340, y: (j + 1) * Y_SPACING },
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
