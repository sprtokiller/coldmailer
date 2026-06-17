import type { InjectionKey } from 'vue'

export interface CanvasNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    stepId: string | null
    stepType: string
    label: string
    status: string
    recordCounts: { total: number }
    sources: Array<{ id: string; label: string; type: string; pipelineRunId: string; createdAt: string | Date; metadata?: Record<string, unknown> | null }>
    // msInputSource extra fields
    addMethod?: string
    total?: number
    selected?: number
  }
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  label?: string
  progressData?: {
    total: number
    completed: number
    completedLabel: string
    remainingLabel: string
  }
}

export interface StepRecord {
  id: string
  globalRecordId: string
  isSelectedForProcessing: boolean
  addMethod: string
  localNote: string | null
  addedAt: string
  adder: { name: string | null } | null
  globalRecord: {
    id: string
    canonicalName: string
    type: string
    payload: Record<string, unknown>
    pipelineRefs: Array<{ pipelineRunId: string; pipelineRun: { name: string } | null }>
  }
  inputSource: { id: string; label: string; type: string; pipelineRunId: string; metadata?: Record<string, unknown> | null } | null
}

export interface GlobalRecord {
  id: string
  canonicalName: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export function usePipelineCanvas(runId: string) {
  const nodes = ref<CanvasNode[]>([])
  const edges = ref<CanvasEdge[]>([])
  const loading = ref(false)

  // Selection state
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const hoveredNodeId = ref<string | null>(null)

  // Active overlay
  const activeOverlayNode = ref<{ stepId: string | null; stepType: string } | null>(null)
  const activeSourceFilter = ref<string | null>(null)
  const expandedSourceIds = ref(new Set<string>())

  // Records per step
  const stepRecords = ref<Record<string, StepRecord[]>>({})
  const stepRecordsLoading = ref<Record<string, boolean>>({})

  // Global record browser
  const globalBrowserOpen = ref(false)
  const globalBrowserStepId = ref<string | null>(null)
  const globalBrowserSearch = ref('')
  const globalBrowserResults = ref<GlobalRecord[]>([])
  const globalBrowserLoading = ref(false)

  // ID of the canvas node that should show the active border (config-tab only)
  const selectedNodeBorderId = ref<string | null>(null)

  // Computed: which node IDs are dimmed when something is selected
  // All nodes sharing the same stepType as the selected node stay active
  const dimmedNodeIds = computed<Set<string>>(() => {
    if (!selectedNodeId.value) return new Set()
    const selectedNode = nodes.value.find(n => n.id === selectedNodeId.value)
    if (!selectedNode) return new Set()
    const activeStepType = selectedNode.data.stepType
    return new Set(nodes.value.filter(n => n.data.stepType !== activeStepType).map(n => n.id))
  })

  // Computed: which edge IDs are highlighted
  const highlightedEdgeIds = computed<Set<string>>(() => {
    if (!selectedNodeId.value && !selectedEdgeId.value) return new Set()
    const result = new Set<string>()
    if (selectedEdgeId.value) {
      const edge = edges.value.find(e => e.id === selectedEdgeId.value)
      if (edge) {
        for (const e of edges.value) {
          if (e.target === edge.target) result.add(e.id)
        }
      }
    } else {
      const activeId = selectedNodeBorderId.value ?? selectedNodeId.value
      if (activeId) {
        for (const e of edges.value) {
          if (e.source === activeId || e.target === activeId) result.add(e.id)
        }
      }
    }
    return result
  })

  async function fetchCanvasData() {
    loading.value = true
    try {
      const data = await $fetch<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>(`/api/pipeline/${runId}/canvas`)
      nodes.value = data.nodes
      edges.value = data.edges
    } finally {
      loading.value = false
    }
  }

  async function fetchStepRecords(stepId: string, filters?: Record<string, string>) {
    stepRecordsLoading.value = { ...stepRecordsLoading.value, [stepId]: true }
    try {
      const records = await $fetch<StepRecord[]>(`/api/pipeline/${runId}/steps/${stepId}/records`, { query: filters })
      stepRecords.value = { ...stepRecords.value, [stepId]: records }
    } finally {
      stepRecordsLoading.value = { ...stepRecordsLoading.value, [stepId]: false }
    }
  }

  function openOverlay(nodeId: string, stepId: string | null, stepType: string) {
    selectedNodeId.value = nodeId
    selectedEdgeId.value = null
    activeOverlayNode.value = { stepId, stepType }
    activeSourceFilter.value = null
    if (stepId && !stepRecords.value[stepId]) fetchStepRecords(stepId)
  }

  function selectEdge(edgeId: string) {
    selectedEdgeId.value = edgeId
    selectedNodeId.value = null
    activeOverlayNode.value = null
    activeSourceFilter.value = null
  }

  function closeOverlay() {
    selectedNodeId.value = null
    selectedEdgeId.value = null
    activeOverlayNode.value = null
    activeSourceFilter.value = null
  }

  function openSourceFilter(stepId: string | null, stepType: string, nodeId: string, sourceId: string) {
    selectedNodeId.value = nodeId
    selectedEdgeId.value = null
    activeOverlayNode.value = { stepId, stepType }
    activeSourceFilter.value = sourceId
    if (stepId) fetchStepRecords(stepId)
  }

  async function removeRecord(stepId: string, refId: string) {
    await $fetch(`/api/pipeline/${runId}/steps/${stepId}/records/${refId}`, { method: 'DELETE' })
    const recs = stepRecords.value[stepId]
    if (recs) stepRecords.value = { ...stepRecords.value, [stepId]: recs.filter(r => r.id !== refId) }
    await fetchCanvasData()
  }

  async function updateRecord(globalRecordId: string, patch: { canonicalName?: string; payload?: Record<string, unknown> }) {
    await $fetch(`/api/records/${globalRecordId}`, { method: 'PATCH', body: patch })
    for (const sid in stepRecords.value) {
      for (const rec of stepRecords.value[sid]) {
        if (rec.globalRecord.id === globalRecordId) {
          if (patch.canonicalName) rec.globalRecord.canonicalName = patch.canonicalName
          if (patch.payload) rec.globalRecord.payload = { ...(rec.globalRecord.payload as object), ...patch.payload }
        }
      }
    }
  }

  async function toggleSelection(refId: string, value: boolean, stepId: string) {
    await $fetch(`/api/pipeline/${runId}/steps/${stepId}/records/${refId}`, {
      method: 'PATCH',
      body: { isSelectedForProcessing: value },
    })
    const recs = stepRecords.value[stepId]
    if (recs) {
      const idx = recs.findIndex(r => r.id === refId)
      if (idx >= 0) stepRecords.value[stepId][idx].isSelectedForProcessing = value
    }
    await fetchCanvasData()
  }

  async function searchGlobalDB(search: string) {
    globalBrowserLoading.value = true
    try {
      globalBrowserResults.value = await $fetch<GlobalRecord[]>('/api/records', { query: { search, limit: 20 } })
    } finally {
      globalBrowserLoading.value = false
    }
  }

  async function addFromGlobalDB(stepId: string, globalRecordId: string) {
    await $fetch(`/api/pipeline/${runId}/steps/${stepId}/records`, {
      method: 'POST',
      body: { globalRecordId },
    })
    await fetchStepRecords(stepId)
    await fetchCanvasData()
  }

  function openGlobalBrowser(stepId: string) {
    globalBrowserStepId.value = stepId
    globalBrowserOpen.value = true
  }

  function closeGlobalBrowser() {
    globalBrowserOpen.value = false
    globalBrowserStepId.value = null
    globalBrowserSearch.value = ''
    globalBrowserResults.value = []
  }

  async function importAI(stepId: string, stepType: string, rawText: string) {
    await $fetch(`/api/pipeline/${runId}/steps/import-ai`, {
      method: 'POST',
      body: { stepType, rawInputText: rawText },
    })
    await fetchCanvasData()
    if (stepId) await fetchStepRecords(stepId)
  }

  async function addManualRecord(stepId: string, name: string, url: string | undefined, type: string) {
    await $fetch(`/api/pipeline/${runId}/steps/${stepId}/records/manual`, {
      method: 'POST',
      body: { name, url, type },
    })
    await fetchStepRecords(stepId)
    await fetchCanvasData()
  }

  async function aiSuggestRecords(stepId: string, query: string, type?: string) {
    return $fetch<Array<{ id: string; canonicalName: string; type: string }>>('/api/records/ai-suggest', {
      method: 'POST',
      body: { stepId, query, type },
    })
  }

  return {
    nodes, edges, loading,
    selectedNodeId, selectedEdgeId, hoveredNodeId,
    activeOverlayNode, activeSourceFilter,
    stepRecords, stepRecordsLoading,
    selectedNodeBorderId,
    dimmedNodeIds, highlightedEdgeIds,
    globalBrowserOpen, globalBrowserStepId, globalBrowserSearch, globalBrowserResults, globalBrowserLoading,
    fetchCanvasData, fetchStepRecords,
    openOverlay, selectEdge, closeOverlay, openSourceFilter,
    expandedSourceIds, toggleSelection,
    searchGlobalDB, addFromGlobalDB,
    openGlobalBrowser, closeGlobalBrowser,
    importAI, addManualRecord, aiSuggestRecords,
    removeRecord, updateRecord,
  }
}

export type PipelineCanvasContext = ReturnType<typeof usePipelineCanvas>
export const canvasKey = Symbol() as InjectionKey<PipelineCanvasContext>
