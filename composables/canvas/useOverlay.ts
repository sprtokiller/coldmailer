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
  const { pl, s4Partners, s5Alignments, ppProfiles, vaAlignments, opEmails } = stepsInput
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
    if (stepType.value === 'VALUE_ALIGNMENT') return s4Partners.value.length > 0 ? `Vstup (${pl?.step4SelectedCount?.() ?? 0}/${s4Partners.value.length})` : 'Vstup'
    return s5Alignments.value.length > 0 ? `Vstup (${pl?.step5SelectedCount?.() ?? 0}/${s5Alignments.value.length})` : 'Vstup'
  })
  const resultTabLabel = computed(() => {
    if (stepType.value === 'MARKET_SCANNING') {
      const msOutput = pipeline?.getStepResult('MARKET_SCANNING')?.outputData
      const count = Array.isArray(msOutput) ? (msOutput as unknown[]).length : 0
      return count > 0 ? `Výsledek (${count})` : 'Výsledek'
    }
    if (stepType.value === 'PARTNER_PROFILING') return ppProfiles.value.length > 0 ? `Výsledek (${ppProfiles.value.length})` : 'Výsledek'
    if (stepType.value === 'VALUE_ALIGNMENT') return vaAlignments.value.length > 0 ? `Výsledek (${vaAlignments.value.length})` : 'Výsledek'
    if (stepType.value === 'OUTREACH_PREPARATION') return opEmails.value.length > 0 ? `Výsledek (${opEmails.value.length})` : 'Výsledek'
    return totalRecords.value > 0 ? `Výsledek (${totalRecords.value})` : 'Výsledek'
  })
  const showStickyTabs = computed(() =>
    stickyTabItems.value.length > 0
  )

  type StickyCategory = 'run' | 'import' | 'db'

  const STICKY_TABS_BY_STEP: Record<string, Array<{ key: StickyCategory; label: string; icon: string; style: string; nodeId: string }>> = {
    MARKET_SCANNING: [
      { key: 'run', label: 'Market Scanning', icon: '▶', style: 'run', nodeId: 'step-MARKET_SCANNING' },
    ],
    PARTNER_IDENTIFICATION: [
      { key: 'run', label: 'Identifikace partnerů', icon: '▶', style: 'run', nodeId: 'step-PARTNER_IDENTIFICATION' },
      { key: 'import', label: 'Importované', icon: '↑', style: 'import', nodeId: 'pi-imported' },
      { key: 'db', label: 'Z databáze', icon: '🔍', style: 'db', nodeId: 'pi-globaldb' },
    ],
  }

  const stickyTabItems = computed(() => {
    const defs = STICKY_TABS_BY_STEP[stepType.value ?? ''] ?? []
    return defs
      .filter(d => canvas.nodes.value.some(n => n.id === d.nodeId))
      .map(d => {
        const node = canvas.nodes.value.find(n => n.id === d.nodeId)
        const total = (node?.data as { recordCounts?: { total: number }; total?: number })?.recordCounts?.total
          ?? (node?.data as { total?: number })?.total
        const label = total != null && total > 0 && d.key !== 'run' ? `${d.label} (${total})` : d.label
        return { ...d, label }
      })
  })

  const activeStickyCategory = computed((): StickyCategory | null => {
    const st = stepType.value
    if (!st || !STICKY_TABS_BY_STEP[st]) return null
    const nodeId = canvas.selectedNodeId.value
    if (nodeId?.endsWith('-imported')) return 'import'
    if (nodeId?.endsWith('-globaldb')) return 'db'
    if (records.configSubSection.value === 'import' || records.activeAddPanel.value === 'import') return 'import'
    if (records.configSubSection.value === 'db' || records.activeAddPanel.value === 'db') return 'db'
    return 'run'
  })

  function selectStickyCategory(key: StickyCategory) {
    if (activeStickyCategory.value === key) return
    const st = stepType.value
    if (!st || !STICKY_TABS_BY_STEP[st]) return
    const def = STICKY_TABS_BY_STEP[st].find(d => d.key === key)
    if (!def) return

    records.activeAddPanel.value = null
    records.configSubSection.value = key === 'run' ? 'run' : key

    const node = canvas.nodes.value.find(n => n.id === def.nodeId)
    const sid = (node?.data.stepId as string | null) ?? stepId.value
    canvas.openOverlay(def.nodeId, sid, st)
  }

  function switchMainTab(key: 'input' | 'config' | 'result') {
    activeTab.value = key
    records.activeAddPanel.value = null
    if (key === 'config') records.configSubSection.value = 'run'
  }

  const tabItems = computed(() => {
    const items: Array<{ key: 'input' | 'config' | 'result'; label: string }> = [
      { key: 'config', label: 'Konfigurace' },
      { key: 'result', label: resultTabLabel.value },
    ]
    // PARTNER_PROFILING and VALUE_ALIGNMENT have no input tab — candidate selection lives in the config tab
    if (stepType.value === 'PARTNER_IDENTIFICATION' || (isOutputStep.value && stepType.value !== 'PARTNER_PROFILING' && stepType.value !== 'VALUE_ALIGNMENT')) {
      items.unshift({ key: 'input', label: inputTabLabel.value })
    }
    return items
  })

  // Resolves which node ID gets the active border (config tab only, MS/PI follow sub-section)
  function syncBorder() {
    if (!stepType.value) { canvas.selectedNodeBorderId.value = null; return }
    if (activeTab.value === 'result') {
      const panel = records.activeAddPanel.value
      if (panel === 'import') {
        canvas.selectedNodeBorderId.value = stepType.value === 'MARKET_SCANNING' ? 'ms-imported' : 'pi-imported'
      } else if (panel === 'db') {
        canvas.selectedNodeBorderId.value = stepType.value === 'MARKET_SCANNING' ? 'ms-globaldb' : 'pi-globaldb'
      } else {
        canvas.selectedNodeBorderId.value = null
      }
      return
    }
    if (activeTab.value !== 'config') { canvas.selectedNodeBorderId.value = null; return }
    if (stepType.value === 'MARKET_SCANNING') {
      canvas.selectedNodeBorderId.value = 'step-MARKET_SCANNING'
    } else if (stepType.value === 'PARTNER_IDENTIFICATION') {
      const sub = records.configSubSection.value
      canvas.selectedNodeBorderId.value = sub === 'import' ? 'pi-imported' : sub === 'db' ? 'pi-globaldb' : 'step-PARTNER_IDENTIFICATION'
    } else {
      canvas.selectedNodeBorderId.value = canvas.selectedNodeId.value
    }
  }
  watch([activeTab, () => records.configSubSection.value, () => records.activeAddPanel.value], syncBorder)

  // Main watcher: reset state when active node changes
  watch(activeNode, (node) => {
    if (!node) { canvas.expandedSourceIds.value = new Set(); canvas.selectedNodeBorderId.value = null; return }
    const hasSourceFilter = !!canvas.activeSourceFilter.value
    const isPiExtraNode = canvas.selectedNodeId.value === 'pi-imported' || canvas.selectedNodeId.value === 'pi-globaldb'
    const stepsWithInput = ['PARTNER_IDENTIFICATION', 'OUTREACH_PREPARATION']
    activeTab.value = hasSourceFilter ? 'result'
      : node.stepType === 'MARKET_SCANNING' || node.stepType === 'PARTNER_PROFILING' || node.stepType === 'VALUE_ALIGNMENT' || isPiExtraNode ? 'config'
      : stepsWithInput.includes(node.stepType) ? 'input' : 'result'
    if (node.stepType === 'PARTNER_PROFILING' && pl) pl.initStep3Selection?.()
    else if (node.stepType === 'VALUE_ALIGNMENT' && pl) pl.initStep4Selection?.()
    else if (node.stepType === 'OUTREACH_PREPARATION' && pl) pl.initStep5Selection?.()
    if (!hasSourceFilter) records.expandedSources.value = new Set()
    stepsInput.expandedPiPartners.value = new Set()
    stepsInput.piRunFilter.value = 'all'
    records.activeAddPanel.value = null
    records.configSubSection.value = canvas.selectedNodeId.value === 'ms-imported' || canvas.selectedNodeId.value === 'pi-imported' ? 'import'
      : canvas.selectedNodeId.value === 'ms-globaldb' || canvas.selectedNodeId.value === 'pi-globaldb' ? 'db'
      : 'run'
    records.importPrefillText.value = ''
    records.editingRefId.value = null
    records.confirmingDeleteSource.value = null
    core.expandedCardIdx.value = null
    syncBorder()
    // Pre-load PI records for cross-pipeline indicator in steps 3-6
    if (['PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'].includes(node.stepType)) {
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
    showStickyTabs, stickyTabItems, activeStickyCategory, selectStickyCategory,
    switchMainTab,
  }
}

export type OverlayState = ReturnType<typeof useOverlay>
export const overlayKey = Symbol() as InjectionKey<OverlayState>
