import type { InjectionKey } from 'vue'
import { useOverlayCore } from './useOverlayCore'
import { useOverlayMsInput } from './useOverlayMsInput'
import { useOverlayStepsInput } from './useOverlayStepsInput'
import { useOverlayRecords } from './useOverlayRecords'
import { useOverlayEdge } from './useOverlayEdge'

export function useOverlay() {
  const core = useOverlayCore()
  const msInput = useOverlayMsInput(core)
  const stepsInput = useOverlayStepsInput(core)
  const records = useOverlayRecords(core)
  const edge = useOverlayEdge(core)

  const { canvas, pipeline, stepType, stepId, activeTab, activeNode, activeEdgeId, isOutputStep, totalRecords } = core
  const { pl, s3Candidates, s4Partners, s5Alignments, s6Emails, ppProfiles, vaAlignments, opEmails, oeResult } = stepsInput
  const { msTotalSelected, msRecords } = msInput

  // PI result records (depends on both stepsInput.piPartnerSources and records.searchFilter)
  const piResultRecords = computed(() => {
    if (stepType.value !== 'PARTNER_IDENTIFICATION') return []
    let recs = core.allRecords.value
    if (records.searchFilter.value) {
      const q = records.searchFilter.value.toLowerCase()
      recs = recs.filter(r => r.globalRecord.canonicalName.toLowerCase().includes(q))
    }
    if (stepsInput.piRunFilter.value === 'current') {
      recs = recs.filter(r => r.inputSource?.pipelineRunId === core.currentRunId)
    }
    return [...recs].sort((a, b) =>
      stepsInput.piPartnerSources(b.globalRecord.canonicalName).length - stepsInput.piPartnerSources(a.globalRecord.canonicalName).length
    )
  })

  // Tab labels (requires state from multiple sub-composables)
  const inputTabLabel = computed(() => {
    if (stepType.value === 'PARTNER_IDENTIFICATION') return 'Vstup'
    if (stepType.value === 'PARTNER_PROFILING') return s3Candidates.value.length > 0 ? `Vstup (${pl?.step3SelectedCount?.() ?? 0}/${s3Candidates.value.length})` : 'Vstup'
    if (stepType.value === 'VALUE_ALIGNMENT') return s4Partners.value.length > 0 ? `Vstup (${pl?.step4SelectedCount?.() ?? 0}/${s4Partners.value.length})` : 'Vstup'
    if (stepType.value === 'OUTREACH_PREPARATION') return s5Alignments.value.length > 0 ? `Vstup (${pl?.step5SelectedCount?.() ?? 0}/${s5Alignments.value.length})` : 'Vstup'
    return s6Emails.value.length > 0 ? `Vstup (${s6Emails.value.length})` : 'Vstup'
  })
  const resultTabLabel = computed(() => {
    if (stepType.value === 'PARTNER_PROFILING') return ppProfiles.value.length > 0 ? `Výsledek (${ppProfiles.value.length})` : 'Výsledek'
    if (stepType.value === 'VALUE_ALIGNMENT') return vaAlignments.value.length > 0 ? `Výsledek (${vaAlignments.value.length})` : 'Výsledek'
    if (stepType.value === 'OUTREACH_PREPARATION') return opEmails.value.length > 0 ? `Výsledek (${opEmails.value.length})` : 'Výsledek'
    if (stepType.value === 'OUTREACH_EXECUTION') return oeResult.value ? 'Výsledek (1)' : 'Výsledek'
    return totalRecords.value > 0 ? `Výsledek (${totalRecords.value})` : 'Výsledek'
  })
  const tabItems = computed(() => {
    const items: Array<{ key: 'input' | 'config' | 'result'; label: string }> = [
      { key: 'config', label: 'Konfigurace' },
      { key: 'result', label: resultTabLabel.value },
    ]
    if (stepType.value === 'PARTNER_IDENTIFICATION' || isOutputStep.value) items.unshift({ key: 'input', label: inputTabLabel.value })
    return items
  })

  // Main watcher: reset state when active node changes
  watch(activeNode, (node) => {
    if (!node) { canvas.expandedSourceIds.value = new Set(); return }
    const hasSourceFilter = !!canvas.activeSourceFilter.value
    const stepsWithInput = ['PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION']
    activeTab.value = hasSourceFilter ? 'result' : node.stepType === 'MARKET_SCANNING' ? 'config' : stepsWithInput.includes(node.stepType) ? 'input' : 'result'
    if (node.stepType === 'PARTNER_PROFILING' && pl) pl.initStep3Selection?.()
    else if (node.stepType === 'VALUE_ALIGNMENT' && pl) pl.initStep4Selection?.()
    else if (node.stepType === 'OUTREACH_PREPARATION' && pl) pl.initStep5Selection?.()
    if (!hasSourceFilter) records.expandedSources.value = new Set()
    stepsInput.expandedPiPartners.value = new Set()
    stepsInput.piRunFilter.value = 'all'
    records.activeAddPanel.value = null
    records.configSubSection.value = 'run'
    records.editingRefId.value = null
    records.confirmingDeleteSource.value = null
    core.expandedCardIdx.value = null
    // Pre-load PI records for cross-pipeline indicator in steps 3-6
    if (['PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION'].includes(node.stepType)) {
      if (stepsInput.piStepId.value && !canvas.stepRecords.value[stepsInput.piStepId.value]) {
        canvas.fetchStepRecords(stepsInput.piStepId.value)
      }
    }
  })

  watch(activeEdgeId, (id) => { if (id) activeTab.value = 'result' })

  // Auto-refresh after step execution completes
  watch(() => pipeline?.executingStep, (newVal, oldVal) => {
    if (oldVal !== null && oldVal !== undefined && newVal === null) {
      canvas.fetchCanvasData()
      if (stepId.value) canvas.fetchStepRecords(stepId.value)
    }
  })

  return {
    ...core, ...msInput, ...stepsInput, ...records, ...edge,
    piResultRecords, inputTabLabel, resultTabLabel, tabItems,
  }
}

export type OverlayState = ReturnType<typeof useOverlay>
export const overlayKey = Symbol() as InjectionKey<OverlayState>
