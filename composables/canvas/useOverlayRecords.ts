import type { StepRecord } from '~/composables/usePipelineCanvas'
import type { OverlayCoreState } from './useOverlayCore'
import { isLegacyRef } from './useOverlayCore'

export interface SourcePanel {
  key: string
  source: StepRecord['inputSource']
  records: StepRecord[]
}

export function useOverlayRecords(core: OverlayCoreState) {
  const { canvas, pipeline, allRecords, stepId, stepType, currentRunId, currentNodeSources, activeTab } = core

  const sourcePanels = computed((): SourcePanel[] => {
    const map = new Map<string, SourcePanel>()
    for (const rec of allRecords.value) {
      const key = rec.inputSource?.id ?? 'legacy'
      if (!map.has(key)) map.set(key, { key, source: rec.inputSource ?? null, records: [] })
      map.get(key)!.records.push(rec)
    }
    // Include sources with 0 records from the canvas node
    for (const src of currentNodeSources.value) {
      if (!map.has(src.id)) map.set(src.id, { key: src.id, source: src, records: [] })
    }
    return [...map.values()].sort((a, b) => (b.records[0]?.addedAt ?? '').localeCompare(a.records[0]?.addedAt ?? ''))
  })

  const expandedSources = canvas.expandedSourceIds
  watch(sourcePanels, (panels) => {
    if (panels.length === 1 && expandedSources.value.size === 0) expandedSources.value = new Set([panels[0].key])
  }, { immediate: true })
  watch(() => canvas.activeSourceFilter.value, (id) => { if (id) expandedSources.value = new Set([id]) })

  function toggleExpand(key: string) {
    const s = new Set(expandedSources.value); s.has(key) ? s.delete(key) : s.add(key); expandedSources.value = s
  }

  const searchFilter = ref('')

  function panelRecords(panel: SourcePanel): StepRecord[] {
    return panel.records.filter(r => {
      if (searchFilter.value && !r.globalRecord.canonicalName.toLowerCase().includes(searchFilter.value.toLowerCase())) return false
      return true
    })
  }

  function msPayload(rec: StepRecord) { return rec.globalRecord.payload as Record<string, string> }

  async function toggleSel(refId: string, val: boolean) {
    if (!stepId.value || refId.startsWith('legacy-')) return
    await canvas.toggleSelection(refId, val, stepId.value)
  }
  async function deleteRecord(rec: StepRecord) {
    if (isLegacyRef(rec) || !stepId.value) return
    await canvas.removeRecord(stepId.value, rec.id)
  }
  async function deleteUnselected(sourceKey: string) {
    if (!stepId.value) return
    const panel = sourcePanels.value.find(p => p.key === sourceKey)
    if (!panel) return
    for (const rec of [...panel.records]) {
      if (!rec.isSelectedForProcessing && !isLegacyRef(rec)) await canvas.removeRecord(stepId.value, rec.id)
    }
  }
  const confirmingDeleteSource = ref<string | null>(null)
  const deleteSourceLoading = ref(false)

  async function deleteSource(sourceId: string, action: 'move_to_db' | 'delete_new') {
    if (!stepId.value) return
    deleteSourceLoading.value = true
    try {
      await $fetch(`/api/pipeline/${currentRunId}/sources/${sourceId}`, {
        method: 'DELETE',
        body: { action },
      })
      confirmingDeleteSource.value = null
      await canvas.fetchStepRecords(stepId.value)
      await canvas.fetchCanvasData()
    } finally {
      deleteSourceLoading.value = false
    }
  }

  async function selectAllInSource(key: string, val: boolean) {
    const panel = sourcePanels.value.find(p => p.key === key)
    if (!panel || !stepId.value) return
    for (const rec of panel.records) { if (!isLegacyRef(rec)) await canvas.toggleSelection(rec.id, val, stepId.value) }
  }

  // Edit state
  const editingRefId = ref<string | null>(null); const editSaving = ref(false)
  const editName = ref(''); const editDescription = ref(''); const editIndustry = ref('')
  const editUrl = ref(''); const editType = ref(''); const editLevel = ref('')
  const editTargetGroup = ref(''); const editOrganizer = ref('')
  const editFrequency = ref(''); const editCompStatus = ref('')
  const MS_LEVEL_OPTIONS = ['school', 'regional', 'national', 'international']
  const MS_FREQ_OPTIONS = ['ročně', 'nepravidelně', 'unknown']
  const MS_STATUS_OPTIONS = ['active', 'inactive', 'uncertain']

  function startEdit(rec: StepRecord) {
    const p = rec.globalRecord.payload as Record<string, string>
    editingRefId.value = rec.id; editName.value = rec.globalRecord.canonicalName
    editUrl.value = p.url ?? p.website ?? ''; editDescription.value = p.description ?? ''
    editIndustry.value = p.industry ?? p.type ?? ''; editType.value = p.type ?? ''
    editLevel.value = p.level ?? ''; editTargetGroup.value = p.target_group ?? ''
    editOrganizer.value = p.organizer ?? ''; editFrequency.value = p.frequency ?? ''; editCompStatus.value = p.status ?? ''
  }
  function cancelEdit() { editingRefId.value = null }
  async function saveEdit(rec: StepRecord) {
    if (!editName.value.trim()) return
    editSaving.value = true
    try {
      const isMS = stepType.value === 'MARKET_SCANNING'; const isPI = stepType.value === 'PARTNER_IDENTIFICATION'
      await canvas.updateRecord(rec.globalRecord.id, {
        canonicalName: editName.value,
        payload: isMS ? { url: editUrl.value || null, type: editType.value || null, level: editLevel.value || null, target_group: editTargetGroup.value || null, organizer: editOrganizer.value || null, description: editDescription.value || null, frequency: editFrequency.value || null, status: editCompStatus.value || null }
          : isPI ? { website: editUrl.value || null, description: editDescription.value || null, industry: editIndustry.value || null }
          : { url: editUrl.value || null },
      })
      editingRefId.value = null
    } finally { editSaving.value = false }
  }

  // Add panel
  type AddPanel = 'import' | 'db' | 'manual' | null
  const activeAddPanel = ref<AddPanel>(null)
  const configSubSection = ref<'run' | 'import' | 'db'>('run')
  const importPrefillText = ref('')

  // Reuse the configuration a source was created with (MS: AI run / AI import)
  interface SourceConfigMeta {
    systemPromptId?: string | null
    contextPartIds?: string[]
    manualContext?: string
    inputData?: Record<string, unknown>
    rawInputText?: string
  }
  function sourceConfigMeta(source: StepRecord['inputSource']): SourceConfigMeta | null {
    const cfg = (source?.metadata as { config?: SourceConfigMeta } | null)?.config
    return cfg && typeof cfg === 'object' ? cfg : null
  }
  function canRehydrate(source: StepRecord['inputSource']): boolean {
    return (source?.type === 'MINI_DEEP_RESEARCH' || source?.type === 'AI_IMPORT') && !!sourceConfigMeta(source)
  }
  function rehydrateConfiguration(source: StepRecord['inputSource']) {
    const meta = sourceConfigMeta(source)
    if (!meta || !stepType.value) return
    if (source!.type === 'AI_IMPORT') {
      importPrefillText.value = meta.rawInputText ?? ''
      configSubSection.value = 'import'
    } else {
      const cfg = pipeline?.getConfig(stepType.value)
      if (cfg) {
        if (meta.systemPromptId) cfg.systemPromptId = meta.systemPromptId
        cfg.contextPartIds = [...(meta.contextPartIds ?? [])]
        cfg.manualContext = meta.manualContext ?? ''
        cfg.inputData = JSON.stringify(meta.inputData ?? {}, null, 2)
      }
      configSubSection.value = 'run'
    }
    activeTab.value = 'config'
  }
  const manualName = ref(''); const manualUrl = ref('')
  const manualLoading = ref(false); const manualError = ref('')
  const manualType = computed(() => stepType.value === 'PARTNER_IDENTIFICATION' ? 'PARTNER' : 'COMPETITION')

  async function doManual() {
    if (!manualName.value.trim() || !stepId.value) return
    manualLoading.value = true; manualError.value = ''
    try {
      await canvas.addManualRecord(stepId.value, manualName.value, manualUrl.value || undefined, manualType.value)
      manualName.value = ''; manualUrl.value = ''; activeAddPanel.value = null
    } catch (e: unknown) { manualError.value = (e as { message?: string })?.message ?? 'Chyba' }
    finally { manualLoading.value = false }
  }

  return {
    sourcePanels, expandedSources, toggleExpand, searchFilter, panelRecords, msPayload,
    confirmingDeleteSource, deleteSourceLoading, deleteSource,
    toggleSel, deleteRecord, deleteUnselected, selectAllInSource,
    editingRefId, editSaving, editName, editDescription, editIndustry,
    editUrl, editType, editLevel, editTargetGroup, editOrganizer, editFrequency, editCompStatus,
    MS_LEVEL_OPTIONS, MS_FREQ_OPTIONS, MS_STATUS_OPTIONS,
    startEdit, cancelEdit, saveEdit,
    activeAddPanel, configSubSection, importPrefillText, canRehydrate, rehydrateConfiguration,
    manualName, manualUrl, manualLoading, manualError, manualType, doManual,
  }
}
