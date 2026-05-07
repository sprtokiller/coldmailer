import { STEP_MODEL, MODEL_BADGE, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'

export const STEPS = [
  { key: 'MARKET_SCANNING', label: 'Market Scanning', description: 'Find relevant high school competitions, events, and channels.' },
  { key: 'PARTNER_IDENTIFICATION', label: 'Partner Identification', description: 'SerpAPI + Playwright + AI – iterates each market item to find partners.' },
  { key: 'PARTNER_PROFILING', label: 'Partner Profiling', description: 'Deep-dive research on a specific partner.' },
  { key: 'CONTACT_DISCOVERY', label: 'Contact Discovery', description: 'Find the right person to reach out to.' },
  { key: 'VALUE_ALIGNMENT', label: 'Value Alignment', description: 'Rank selling points by relevance to this partner.' },
  { key: 'OUTREACH_PREPARATION', label: 'Outreach Preparation', description: 'Generate a tailored email draft.' },
  { key: 'OUTREACH_EXECUTION', label: 'Outreach Execution', description: 'Create draft directly in Gmail.' },
] as const

export type StepKey = typeof STEPS[number]['key']
export type StepDefinition = typeof STEPS[number]

export type PromptOption = {
  id: string
  name: string
  content: string
  stepType: string
  isSystem: boolean
  author: { name: string }
}

interface RunStepResult {
  id: string
  stepType: string
  status: string
  systemPromptId: string | null
  runner?: { name: string }
  systemPrompt?: { name: string }
  outputData?: unknown
  errorMessage?: unknown
}

interface PipelineRunResponse {
  name: string
  author: { name: string }
  createdAt: string
  steps: RunStepResult[]
}

interface StepConfigState {
  systemPromptId: string
  contextPartIds: string[]
  sellingPointId: string
  inputData: string
}

interface PartnerResultItem {
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  partners?: Array<{ partnerId: string; name: string; isNew: boolean }>
  error?: string
}

interface Step3Candidate {
  partnerId: string
  name: string
  frequency: number
  itemNames: string[]
}

interface PipelineRunContext {
  route: ReturnType<typeof useRoute>
  run: PipelineRunResponse | null
  refresh: () => Promise<void>
  steps: readonly StepDefinition[]
  prompts: PromptOption[]
  contextParts: Array<{ id: string; name: string; content: string }>
  sellingPoints: Array<{ id: string; name: string }>
  activeStep: string | null
  executingStep: string | null
  streamOutputs: Record<string, string>
  editingOutputStep: string | null
  editingOutputDraft: string
  confirmingOutputStep: string | null
  savingOutput: boolean
  aiImportStep: string | null
  aiImportText: string
  aiImportLoading: boolean
  partnerProgress: Record<string, Array<{
    index: number
    total: number
    itemName: string
    searchTerm?: string
    serpResults?: number
    pagesLoaded?: number
    partnersFound?: number
    status: 'processing' | 'done' | 'error'
    error?: string
  }>>
  profilingProgress: Record<string, Array<{
    index: number
    total: number
    name: string
    status: 'processing' | 'done' | 'error'
    error?: string
    profile?: Record<string, unknown>
  }>>
  step3SelectedIds: Record<string, boolean>
  step3FreqFilter: number
  step3Initialized: boolean
  expandedProfileName: string | null
  promptPreviewStep: string | null
  outputViewMode: Record<string, string>
  copiedPromptKey: string | null
  candidateHoverIdx: number | null
  getConfig: (stepKey: string) => StepConfigState
  isAiImportStep: (stepKey: string) => boolean
  toggleAiImport: (stepKey: string) => void
  runAiImport: (stepKey: string) => Promise<void>
  deleteTableRow: (stepKey: string, rowIndex: number) => Promise<void>
  deleteProfilingProfile: (stepKey: string, profileIndex: number) => Promise<void>
  startEditOutput: (stepKey: string) => void
  cancelEditOutput: () => void
  requestSaveOutput: (stepKey: string) => void
  confirmSaveOutput: (stepKey: string) => Promise<void>
  step3Candidates: () => Step3Candidate[]
  initStep3Selection: () => void
  step3SelectAll: () => void
  step3DeselectAll: () => void
  step3FilteredCandidates: () => Step3Candidate[]
  step3SelectedCount: () => number
  updateProfilingItem: (stepKey: string, item: { index: number; total: number; name: string; status: 'processing' | 'done' | 'error'; error?: string; profile?: Record<string, unknown> }) => void
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>
  updatePartnerItem: (stepKey: string, item: { index: number; total: number; itemName: string; searchTerm?: string; serpResults?: number; pagesLoaded?: number; partnersFound?: number; status: 'processing' | 'done' | 'error'; error?: string }) => void
  getStepResult: (stepKey: string) => RunStepResult | undefined
  promptsForStep: (stepKey: StepKey) => PromptOption[]
  stepResultStatus: (stepKey: StepKey) => string | undefined
  stepResultRunnerName: (stepKey: StepKey) => string
  stepResultPromptName: (stepKey: StepKey) => string | undefined
  stepResultOutput: (stepKey: string) => string
  executeStep: (stepKey: string) => Promise<void>
  prevStepOutput: (stepKey: string) => string
  getOutputMode: (stepKey: string, defaultMode?: string) => string
  setOutputMode: (stepKey: string, mode: string) => void
  resolveTable: (stepKey: string) => { rows: Record<string, unknown>[]; wrapKey: string | null } | null
  tableColumns: (arr: Record<string, unknown>[]) => string[]
  partnerItems: (stepKey: string) => PartnerResultItem[]
  candidateList: (stepKey: string) => Array<{ name: string; itemCount: number; itemNames: string[] }>
  selectedPrompt: (stepKey: string) => { id: string; name: string; content: string; author: { name: string } } | null
  modelBadge: (stepKey: string) => { label: string; cls: string }
  buildFullPrompt: (stepKey: string, userMessage: string) => string
  step1CopyPrompt: (stepKey: string) => string
  step3PartnerCopyPrompt: (stepKey: string, partner: Step3Candidate) => string
  copyDeepResearchPrompt: (key: string, text: string) => Promise<void>
}

export const pipelineRunKey = Symbol('pipelineRun')

export async function usePipelineRunPage() {
  const route = useRoute()
  const [runResult, promptsResult, contextPartsResult, sellingPointsResult] = await Promise.all([
    useFetch<PipelineRunResponse>(`/api/pipeline/${route.params.id}`),
    useFetch<PromptOption[]>('/api/library/prompts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; content: string }>>('/api/library/context-parts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string }>>('/api/library/selling-points', { default: () => [] }),
  ])
  const { data: run, refresh } = runResult
  const { data: prompts } = promptsResult
  const { data: contextParts } = contextPartsResult
  const { data: sellingPoints } = sellingPointsResult

  const activeStep = ref<string | null>(null)
  const executingStep = ref<string | null>(null)
  const streamOutputs = ref<Record<string, string>>({})

  const editingOutputStep = ref<string | null>(null)
  const editingOutputDraft = ref('')
  const confirmingOutputStep = ref<string | null>(null)
  const savingOutput = ref(false)

  const aiImportStep = ref<string | null>(null)
  const aiImportText = ref('')
  const aiImportLoading = ref(false)

  const stepConfig = ref<Record<string, StepConfigState>>({})
  const partnerProgress = ref<Record<string, Array<{
    index: number
    total: number
    itemName: string
    searchTerm?: string
    serpResults?: number
    pagesLoaded?: number
    partnersFound?: number
    status: 'processing' | 'done' | 'error'
    error?: string
  }>>>({})

  const profilingProgress = ref<Record<string, Array<{
    index: number
    total: number
    name: string
    status: 'processing' | 'done' | 'error'
    error?: string
    profile?: Record<string, unknown>
  }>>>({})

  const step3SelectedIds = ref<Record<string, boolean>>({})
  const step3FreqFilter = ref(1)
  const step3Initialized = ref(false)
  const expandedProfileName = ref<string | null>(null)
  const promptPreviewStep = ref<string | null>(null)
  const outputViewMode = ref<Record<string, string>>({})
  const copiedPromptKey = ref<string | null>(null)
  const candidateHoverIdx = ref<number | null>(null)

  function getConfig(stepKey: string) {
    if (!stepConfig.value[stepKey]) {
      const lastSuccessful = run.value?.steps
        .filter((s) => s.stepType === stepKey && s.status === 'COMPLETED' && s.systemPromptId)
        .at(-1)

      const systemPrompt = prompts.value.find(p => p.stepType === stepKey && p.isSystem)

      stepConfig.value[stepKey] = {
        systemPromptId: lastSuccessful?.systemPromptId ?? systemPrompt?.id ?? '',
        contextPartIds: [],
        sellingPointId: '',
        inputData: '{}',
      }
    }
    return stepConfig.value[stepKey]
  }

  function isAiImportStep(stepKey: string) {
    return ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING'].includes(stepKey)
  }

  function toggleAiImport(stepKey: string) {
    if (aiImportStep.value === stepKey) {
      aiImportStep.value = null
    } else {
      aiImportStep.value = stepKey
      aiImportText.value = ''
    }
  }

  function getStepResult(stepKey: string) {
    return run.value?.steps.findLast((s) => s.stepType === stepKey)
  }

  function promptsForStep(stepKey: StepKey) {
    return prompts.value.filter(p => p.stepType === stepKey)
  }

  function stepResultStatus(stepKey: StepKey) {
    return getStepResult(stepKey)?.status
  }

  function stepResultRunnerName(stepKey: StepKey) {
    return getStepResult(stepKey)?.runner?.name ?? ''
  }

  function stepResultPromptName(stepKey: StepKey) {
    return getStepResult(stepKey)?.systemPrompt?.name
  }

  function stepResultOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    return JSON.stringify(result?.outputData ?? result?.errorMessage, null, 2)
  }

  function updatePartnerItem(stepKey: string, item: (typeof partnerProgress.value)[string][number]) {
    if (!partnerProgress.value[stepKey]) partnerProgress.value[stepKey] = []
    const idx = partnerProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) partnerProgress.value[stepKey][idx] = item
    else partnerProgress.value[stepKey].push(item)
  }

  function updateProfilingItem(stepKey: string, item: (typeof profilingProgress.value)[string][number]) {
    if (!profilingProgress.value[stepKey]) profilingProgress.value[stepKey] = []
    const idx = profilingProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) profilingProgress.value[stepKey][idx] = item
    else profilingProgress.value[stepKey].push(item)
  }

  function profilingOutputProfiles(stepKey: string): Array<Record<string, unknown>> {
    const data = getStepResult(stepKey)?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  watch(activeStep, (val) => {
    if (val === 'PARTNER_PROFILING') initStep3Selection()
  })

  function step3Candidates(): Step3Candidate[] {
    const items = partnerItems('PARTNER_IDENTIFICATION')
    const map = new Map<string, Step3Candidate>()
    for (const item of items) {
      for (const p of (item.partners ?? []) as Array<{ partnerId: string; name: string }>) {
        if (!p.partnerId) continue
        if (map.has(p.partnerId)) {
          const candidate = map.get(p.partnerId)!
          candidate.frequency++
          candidate.itemNames.push(item.itemName)
        } else {
          map.set(p.partnerId, { partnerId: p.partnerId, name: p.name, frequency: 1, itemNames: [item.itemName] })
        }
      }
    }
    return [...map.values()].sort((a, b) => b.frequency - a.frequency)
  }

  function initStep3Selection() {
    if (step3Initialized.value) return
    const selected: Record<string, boolean> = {}
    for (const candidate of step3Candidates()) selected[candidate.partnerId] = true
    step3SelectedIds.value = selected
    step3Initialized.value = true
  }

  function step3SelectAll() {
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3Candidates()) {
      if (candidate.frequency >= step3FreqFilter.value) selected[candidate.partnerId] = true
    }
    step3SelectedIds.value = selected
  }

  function step3DeselectAll() {
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3Candidates()) selected[candidate.partnerId] = false
    step3SelectedIds.value = selected
  }

  function step3FilteredCandidates() {
    return step3Candidates().filter(candidate => candidate.frequency >= step3FreqFilter.value)
  }

  function step3SelectedCount() {
    return step3FilteredCandidates().filter(candidate => step3SelectedIds.value[candidate.partnerId]).length
  }

  function partnerItems(stepKey: string): PartnerResultItem[] {
    const data = getStepResult(stepKey)?.outputData as { items?: PartnerResultItem[] } | undefined
    return data?.items ?? []
  }

  interface CandidateSummary {
    name: string
    itemCount: number
    itemNames: string[]
  }

  function candidateList(stepKey: string): CandidateSummary[] {
    const items = partnerItems(stepKey)
    const map = new Map<string, CandidateSummary>()
    for (const item of items) {
      for (const partner of item.partners ?? []) {
        const key = partner.name.toLowerCase().trim()
        if (map.has(key)) {
          const summary = map.get(key)!
          summary.itemCount++
          summary.itemNames.push(item.itemName)
        } else {
          map.set(key, { name: partner.name, itemCount: 1, itemNames: [item.itemName] })
        }
      }
    }
    return [...map.values()].sort((a, b) => b.itemCount - a.itemCount)
  }

  function selectedPrompt(stepKey: string) {
    const id = getConfig(stepKey).systemPromptId
    if (!id) return null
    return prompts.value.find(p => p.id === id) ?? null
  }

  function modelBadge(stepKey: string) {
    return MODEL_BADGE[STEP_MODEL[stepKey] ?? ''] ?? { label: stepKey, cls: 'bg-gray-100 text-gray-500' }
  }

  function buildFullPrompt(stepKey: string, userMessage: string): string {
    const cfg = getConfig(stepKey)
    const systemPrompt = selectedPrompt(stepKey)
    const systemContent = systemPrompt?.content ?? STEP_SYSTEM_PROMPTS[stepKey] ?? ''

    const selectedCtxParts = contextParts.value.filter(cp => cfg.contextPartIds.includes(cp.id))
    const parts: string[] = [systemContent]

    if (selectedCtxParts.length) {
      parts.push(selectedCtxParts.map(cp => `## ${cp.name}\n${cp.content}`).join('\n\n'))
    }

    parts.push(userMessage)
    return parts.join('\n\n---\n\n')
  }

  function step1CopyPrompt(stepKey: string): string {
    return buildFullPrompt(stepKey, `Research this topic/industry:\n\n{}`)
  }

  function step3PartnerCopyPrompt(stepKey: string, partner: Step3Candidate): string {
    const lines = [
      'Research this potential partnership candidate and return the structured JSON defined in the system prompt:',
      '',
      `Name: ${partner.name}`,
      `Found in ${partner.frequency} context(s): ${partner.itemNames.join(', ')}`,
    ]
    return buildFullPrompt(stepKey, lines.join('\n'))
  }

  async function copyDeepResearchPrompt(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copiedPromptKey.value = key
      setTimeout(() => {
        if (copiedPromptKey.value === key) copiedPromptKey.value = null
      }, 2000)
    } catch {
      return
    }
  }

  function getOutputMode(stepKey: string, defaultMode = 'table') {
    return outputViewMode.value[stepKey] ?? defaultMode
  }

  function setOutputMode(stepKey: string, mode: string) {
    outputViewMode.value[stepKey] = mode
  }

  function resolveTable(stepKey: string): { rows: Record<string, unknown>[]; wrapKey: string | null } | null {
    const raw = getStepResult(stepKey)?.outputData
    if (!raw) return null

    if (Array.isArray(raw)) {
      if (raw.length === 0 || typeof raw[0] !== 'object' || raw[0] === null) return null
      return { rows: raw as Record<string, unknown>[], wrapKey: null }
    }

    if (typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          return { rows: value as Record<string, unknown>[], wrapKey: key }
        }
      }
    }

    return null
  }

  function tableColumns(arr: Record<string, unknown>[]): string[] {
    return Object.keys(arr[0] ?? {})
  }

  async function deleteTableRow(stepKey: string, rowIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const table = resolveTable(stepKey)
    if (!table) return
    const newRows = table.rows.filter((_, i) => i !== rowIndex)
    const newData = table.wrapKey ? { ...(result.outputData as Record<string, unknown>), [table.wrapKey]: newRows } : newRows
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: newData },
    })
    await refresh()
  }

  async function deleteProfilingProfile(stepKey: string, profileIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const profiles = profilingOutputProfiles(stepKey)
    const newData = profiles.filter((_, i) => i !== profileIndex)
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: newData },
    })
    await refresh()
  }

  function startEditOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    editingOutputDraft.value = JSON.stringify(result?.outputData ?? {}, null, 2)
    editingOutputStep.value = stepKey
    confirmingOutputStep.value = null
  }

  function cancelEditOutput() {
    editingOutputStep.value = null
    confirmingOutputStep.value = null
  }

  function requestSaveOutput(stepKey: string) {
    try {
      JSON.parse(editingOutputDraft.value)
    } catch {
      alert('Neplatný JSON – opravte ho před uložením.')
      return
    }
    confirmingOutputStep.value = stepKey
  }

  async function confirmSaveOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    if (!result) return
    savingOutput.value = true
    try {
      await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
        method: 'PATCH',
        body: { outputData: JSON.parse(editingOutputDraft.value) },
      })
      await refresh()
      editingOutputStep.value = null
      confirmingOutputStep.value = null
    } finally {
      savingOutput.value = false
    }
  }

  async function runAiImport(stepKey: string) {
    if (!aiImportText.value.trim()) return
    aiImportLoading.value = true
    try {
      const response = await fetch(`/api/pipeline/${route.params.id}/steps/import-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepType: stepKey,
          systemPromptId: getConfig(stepKey).systemPromptId || undefined,
          rawInputText: aiImportText.value,
        }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)
        throw new Error(text)
      }
      await refresh()
      aiImportStep.value = null
      aiImportText.value = ''
    } catch (error: unknown) {
      alert(`AI Import: ${error instanceof Error ? error.message : 'Import selhal'}`)
    } finally {
      aiImportLoading.value = false
    }
  }

  async function executeStep(stepKey: string) {
    const cfg = getConfig(stepKey)
    let inputData: Record<string, unknown> = {}

    if (stepKey === 'PARTNER_PROFILING') {
      const selected = step3FilteredCandidates().filter(candidate => step3SelectedIds.value[candidate.partnerId])
      if (selected.length === 0) {
        alert('Vyberte alespoň jednoho partnera k prozkoumání.')
        return
      }
      inputData = { partners: selected }
    } else {
      try {
        inputData = JSON.parse(cfg.inputData || '{}')
      } catch {
        inputData = {}
      }
    }

    executingStep.value = stepKey
    streamOutputs.value[stepKey] = ''
    partnerProgress.value[stepKey] = []
    profilingProgress.value[stepKey] = []

    let response: Response
    try {
      response = await fetch(`/api/pipeline/${route.params.id}/steps/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepType: stepKey,
          systemPromptId: cfg.systemPromptId || undefined,
          contextPartIds: cfg.contextPartIds.length ? cfg.contextPartIds : undefined,
          sellingPointId: cfg.sellingPointId || undefined,
          inputData,
        }),
      })
    } catch {
      executingStep.value = null
      alert('Network error — could not reach the server.')
      return
    }

    if (!response.ok) {
      executingStep.value = null
      const text = await response.text().catch(() => response.statusText)
      alert(`Failed to start step: ${text}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk !== undefined) {
              streamOutputs.value[stepKey] = (streamOutputs.value[stepKey] ?? '') + data.chunk
            }
            if (data.partnerItem) {
              updatePartnerItem(stepKey, data.partnerItem)
            }
            if (data.profilingItem) {
              updateProfilingItem(stepKey, data.profilingItem)
            }
            if (data.error) {
              alert(`Step failed: ${data.error}`)
            }
            if (data.done) {
              await refresh()
            }
          } catch {
            continue
          }
        }
      }
    } finally {
      executingStep.value = null
    }
  }

  function prevStepOutput(stepKey: string): string {
    const idx = STEPS.findIndex(step => step.key === stepKey)
    if (idx <= 0) return '{}'
    const prevKey = STEPS[idx - 1].key
    const prevStep = getStepResult(prevKey)
    return prevStep?.outputData ? JSON.stringify(prevStep.outputData, null, 2) : '{}'
  }

  const pipeline = reactive({
    route,
    run,
    refresh,
    steps: STEPS,
    prompts,
    contextParts,
    sellingPoints,
    activeStep,
    executingStep,
    streamOutputs,
    editingOutputStep,
    editingOutputDraft,
    confirmingOutputStep,
    savingOutput,
    aiImportStep,
    aiImportText,
    aiImportLoading,
    partnerProgress,
    profilingProgress,
    step3SelectedIds,
    step3FreqFilter,
    step3Initialized,
    expandedProfileName,
    promptPreviewStep,
    outputViewMode,
    copiedPromptKey,
    candidateHoverIdx,
    getConfig,
    isAiImportStep,
    toggleAiImport,
    runAiImport,
    deleteTableRow,
    deleteProfilingProfile,
    startEditOutput,
    cancelEditOutput,
    requestSaveOutput,
    confirmSaveOutput,
    step3Candidates,
    initStep3Selection,
    step3SelectAll,
    step3DeselectAll,
    step3FilteredCandidates,
    step3SelectedCount,
    updateProfilingItem,
    profilingOutputProfiles,
    updatePartnerItem,
    getStepResult,
    promptsForStep,
    stepResultStatus,
    stepResultRunnerName,
    stepResultPromptName,
    stepResultOutput,
    executeStep,
    prevStepOutput,
    getOutputMode,
    setOutputMode,
    resolveTable,
    tableColumns,
    partnerItems,
    candidateList,
    selectedPrompt,
    modelBadge,
    buildFullPrompt,
    step1CopyPrompt,
    step3PartnerCopyPrompt,
    copyDeepResearchPrompt,
  }) as PipelineRunContext


  return pipeline
}
