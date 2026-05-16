import { STEP_MODEL, MODEL_BADGE, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'

export const STEPS = [
  { key: 'MARKET_SCANNING', label: 'Market Scanning', description: 'Najde relevantní kanály (např. středoškolské soutěže a jiné akce).' },
  { key: 'PARTNER_IDENTIFICATION', label: 'Partner Identification', description: 'SerpAPI + Playwright + AI – prochází každou tržní položku a hledá partnery.' },
  { key: 'PARTNER_PROFILING', label: 'Partner Profiling', description: 'Hloubkový průzkum konkrétního partnera včetně nalezení kontaktních osob.' },
  { key: 'VALUE_ALIGNMENT', label: 'Value Alignment', description: 'Seřadí prodejní argumenty podle relevance pro partnera.' },
  { key: 'OUTREACH_PREPARATION', label: 'Outreach Preparation', description: 'Vygeneruje přizpůsobený návrh e-mailu.' },
  { key: 'OUTREACH_EXECUTION', label: 'Outreach Execution', description: 'Vytvoří návrh přímo v Gmailu.' },
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
  manualContext: string
  sellingPointId: string
  inputData: string
  emailDraftId: string
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
  contextParts: Array<{ id: string; name: string; content: string; stepKeys: string[] }>
  sellingPoints: Array<{ id: string; name: string }>
  emailDrafts: Array<{ id: string; name: string; subject: string; body: string }>
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
  step2SelectedItems: Record<string, boolean>
  step2Initialized: boolean
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
  alignmentProgress: Record<string, Array<{
    index: number
    total: number
    name: string
    status: 'processing' | 'done' | 'error'
    error?: string
    alignment?: Record<string, unknown>
  }>>
  step3SelectedIds: Record<string, boolean>
  step3FreqFilter: number
  step3Initialized: boolean
  step4SelectedIds: Record<string, boolean>
  step4Initialized: boolean
  step5SelectedIds: Record<string, boolean>
  step5Initialized: boolean
  step6SelectedPartnerName: string | null
  step6PreviewTo: string
  step6PreviewSubject: string
  step6PreviewBody: string
  expandedProfileName: string | null
  promptPreviewStep: string | null
  outputViewMode: Record<string, string>
  copiedPromptKey: string | null
  candidateHoverIdx: number | null
  getConfig: (stepKey: string) => StepConfigState
  saveContextPartToLibrary: (stepKey: string, name: string) => Promise<void>
  isAiImportStep: (stepKey: string) => boolean
  toggleAiImport: (stepKey: string) => void
  runAiImport: (stepKey: string) => Promise<void>
  deleteTableRow: (stepKey: string, rowIndex: number) => Promise<void>
  deleteTableRows: (stepKey: string, rowIndices: number[]) => Promise<void>
  deleteProfilingProfile: (stepKey: string, profileIndex: number) => Promise<void>
  deletePartnerItem: (stepKey: string, itemIndex: number) => Promise<void>
  deletePartnerCandidate: (stepKey: string, candidateName: string) => Promise<void>
  startEditOutput: (stepKey: string) => void
  cancelEditOutput: () => void
  requestSaveOutput: (stepKey: string) => void
  confirmSaveOutput: (stepKey: string) => Promise<void>
  step2Items: () => Array<{ index: number; name: string; raw: Record<string, unknown> }>
  initStep2Selection: () => void
  step2SelectAll: () => void
  step2DeselectAll: () => void
  step2SelectedCount: () => number
  step3Candidates: () => Step3Candidate[]
  initStep3Selection: () => void
  step3SelectAll: () => void
  step3DeselectAll: () => void
  step3SelectUnprocessed: () => void
  step3FilteredCandidates: () => Step3Candidate[]
  step3SelectedCount: () => number
  updateProfilingItem: (stepKey: string, item: { index: number; total: number; name: string; status: 'processing' | 'done' | 'error'; error?: string; profile?: Record<string, unknown> }) => void
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>
  step4Partners: () => Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }>
  initStep4Selection: () => void
  step4SelectAll: () => void
  step4DeselectAll: () => void
  step4SelectUnprocessed: () => void
  step4SelectedCount: () => number
  step5Alignments: () => Array<Record<string, unknown>>
  initStep5Selection: () => void
  step5SelectAll: () => void
  step5DeselectAll: () => void
  step5SelectedCount: () => number
  outreachEmails: () => Array<Record<string, unknown>>
  initStep6Preview: (partnerName: string) => void
  updatePartnerItem: (stepKey: string, item: { index: number; total: number; itemName: string; searchTerm?: string; serpResults?: number; pagesLoaded?: number; partnersFound?: number; status: 'processing' | 'done' | 'error'; error?: string }) => void
  updateAlignmentItem: (stepKey: string, item: { index: number; total: number; name: string; status: 'processing' | 'done' | 'error'; error?: string; alignment?: Record<string, unknown> }) => void
  alignmentOutputAlignments: (stepKey: string) => Array<Record<string, unknown>>
  step4PartnerCopyPrompt: (stepKey: string, partnerName: string) => string
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
  step4CopyPrompt: (stepKey: string) => string
  copyDeepResearchPrompt: (key: string, text: string) => Promise<void>
}

export const pipelineRunKey = Symbol('pipelineRun')

export async function usePipelineRunPage() {
  const route = useRoute()
  const [runResult, promptsResult, contextPartsResult, sellingPointsResult, emailDraftsResult] = await Promise.all([
    useFetch<PipelineRunResponse>(`/api/pipeline/${route.params.id}`),
    useFetch<PromptOption[]>('/api/library/prompts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; content: string; stepKeys: string[] }>>('/api/library/context-parts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string }>>('/api/library/selling-points', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; subject: string; body: string }>>('/api/library/email-drafts', { default: () => [] }),
  ])
  const { data: run, refresh } = runResult
  const { data: prompts } = promptsResult
  const { data: contextParts } = contextPartsResult
  const { data: sellingPoints } = sellingPointsResult
  const { data: emailDrafts } = emailDraftsResult

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

  const alignmentProgress = ref<Record<string, Array<{
    index: number
    total: number
    name: string
    status: 'processing' | 'done' | 'error'
    error?: string
    alignment?: Record<string, unknown>
  }>>>({})

  const step2SelectedItems = ref<Record<string, boolean>>({})
  const step2Initialized = ref(false)
  const step3SelectedIds = ref<Record<string, boolean>>({})
  const step3FreqFilter = ref(1)
  const step3Initialized = ref(false)
  const step4SelectedIds = ref<Record<string, boolean>>({})
  const step4Initialized = ref(false)
  const expandedProfileName = ref<string | null>(null)
  const promptPreviewStep = ref<string | null>(null)
  const outputViewMode = ref<Record<string, string>>({})
  const copiedPromptKey = ref<string | null>(null)
  const candidateHoverIdx = ref<number | null>(null)

  const step5SelectedIds = ref<Record<string, boolean>>({})
  const step5Initialized = ref(false)
  const step6SelectedPartnerName = ref<string | null>(null)
  const step6PreviewTo = ref('')
  const step6PreviewSubject = ref('')
  const step6PreviewBody = ref('')

  function getConfig(stepKey: string) {
    if (!stepConfig.value[stepKey]) {
      const lastSuccessful = run.value?.steps
        .filter((s) => s.stepType === stepKey && s.status === 'COMPLETED' && s.systemPromptId)
        .at(-1)

      const systemPrompt = prompts.value.find(p => p.stepType === stepKey && p.isSystem)

      const idx = STEPS.findIndex(s => s.key === stepKey)
      let inputData = '{}'
      if (idx > 0) {
        const prevKey = STEPS[idx - 1].key
        const prevResult = run.value?.steps.findLast(s => s.stepType === prevKey)
        if (prevResult?.outputData) {
          inputData = JSON.stringify(prevResult.outputData, null, 2)
        }
      }

      stepConfig.value[stepKey] = {
        systemPromptId: lastSuccessful?.systemPromptId ?? systemPrompt?.id ?? '',
        contextPartIds: [],
        manualContext: '',
        sellingPointId: '',
        inputData,
        emailDraftId: '',
      }
    }
    return stepConfig.value[stepKey]
  }

  async function saveContextPartToLibrary(stepKey: string, name: string) {
    const cfg = getConfig(stepKey)
    const created = await $fetch<{ id: string; name: string; content: string; stepKeys: string[] }>('/api/library/context-parts', {
      method: 'POST',
      body: { name, content: cfg.manualContext, stepKeys: [stepKey] },
    })
    if (contextParts.value && !contextParts.value.find(cp => cp.id === created.id)) {
      contextParts.value.push({ id: created.id, name: created.name, content: created.content, stepKeys: created.stepKeys })
    }
    if (!cfg.contextPartIds.includes(created.id)) {
      cfg.contextPartIds.push(created.id)
    }
    cfg.manualContext = ''
  }

  function isAiImportStep(stepKey: string) {
    return ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT'].includes(stepKey)
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
    return (
      run.value?.steps.findLast((s) => s.stepType === stepKey && s.status === 'COMPLETED')
      ?? run.value?.steps.findLast((s) => s.stepType === stepKey)
    )
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

  function updateAlignmentItem(stepKey: string, item: (typeof alignmentProgress.value)[string][number]) {
    if (!alignmentProgress.value[stepKey]) alignmentProgress.value[stepKey] = []
    const idx = alignmentProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) alignmentProgress.value[stepKey][idx] = item
    else alignmentProgress.value[stepKey].push(item)
  }

  function alignmentOutputAlignments(stepKey: string): Array<Record<string, unknown>> {
    const data = getStepResult(stepKey)?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function profilingOutputProfiles(stepKey: string): Array<Record<string, unknown>> {
    const data = getStepResult(stepKey)?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function step4Partners(): Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }> {
    const data = getStepResult('PARTNER_PROFILING')?.outputData
    if (!Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .filter(p => p.name && !p.error)
      .map(p => ({
        partnerId: p.partnerId as string | undefined,
        name: String(p.name),
        website: p.website as string | undefined,
        linkedinUrl: p.linkedinUrl as string | undefined,
        industry: p.industry as string | undefined,
      }))
  }

  function initStep4Selection() {
    if (step4Initialized.value) return
    const done = new Set(
      alignmentOutputAlignments('VALUE_ALIGNMENT').map(a =>
        String(a.partnerId ?? a.name ?? '').toLowerCase(),
      ),
    )
    const selected: Record<string, boolean> = {}
    for (const p of step4Partners()) {
      const isProcessed = done.has(String(p.partnerId ?? '').toLowerCase()) || done.has(p.name.toLowerCase())
      selected[p.name] = !isProcessed
    }
    step4SelectedIds.value = selected
    step4Initialized.value = true
  }

  function step4SelectAll() {
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) selected[p.name] = true
    step4SelectedIds.value = selected
  }

  function step4DeselectAll() {
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) selected[p.name] = false
    step4SelectedIds.value = selected
  }

  function step4SelectUnprocessed() {
    const done = new Set(
      alignmentOutputAlignments('VALUE_ALIGNMENT').map(a =>
        String(a.partnerId ?? a.name ?? '').toLowerCase(),
      ),
    )
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) {
      const isProcessed = done.has(String(p.partnerId ?? '').toLowerCase()) || done.has(p.name.toLowerCase())
      selected[p.name] = !isProcessed
    }
    step4SelectedIds.value = selected
  }

  function step4SelectedCount() {
    return step4Partners().filter(p => step4SelectedIds.value[p.name]).length
  }

  function step5Alignments(): Array<Record<string, unknown>> {
    return alignmentOutputAlignments('VALUE_ALIGNMENT')
  }

  function initStep5Selection() {
    if (step5Initialized.value) return
    const done = new Set(
      outreachEmails().map(e => String(e.partnerName ?? e.name ?? '').toLowerCase()),
    )
    const selected: Record<string, boolean> = {}
    for (const a of step5Alignments()) {
      const isProcessed = done.has(String(a.name ?? '').toLowerCase())
      selected[String(a.name ?? '')] = !isProcessed
    }
    step5SelectedIds.value = selected
    step5Initialized.value = true
  }

  function step5SelectAll() {
    const selected = { ...step5SelectedIds.value }
    for (const a of step5Alignments()) selected[String(a.name ?? '')] = true
    step5SelectedIds.value = selected
  }

  function step5DeselectAll() {
    const selected = { ...step5SelectedIds.value }
    for (const a of step5Alignments()) selected[String(a.name ?? '')] = false
    step5SelectedIds.value = selected
  }

  function step5SelectedCount() {
    return step5Alignments().filter(a => step5SelectedIds.value[String(a.name ?? '')]).length
  }

  function outreachEmails(): Array<Record<string, unknown>> {
    const data = getStepResult('OUTREACH_PREPARATION')?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function initStep6Preview(partnerName: string) {
    const email = outreachEmails().find(e => String(e.partnerName ?? e.name ?? '') === partnerName)
    if (email) {
      step6PreviewTo.value = String(email.to ?? '')
      step6PreviewSubject.value = String(email.subject ?? '')
      step6PreviewBody.value = String(email.body ?? '')
    }
  }

  function step2Items(): Array<{ index: number; name: string; raw: Record<string, unknown> }> {
    const data = getStepResult('MARKET_SCANNING')?.outputData
    if (!data) return []
    let arr: Record<string, unknown>[]
    if (Array.isArray(data)) {
      arr = data as Record<string, unknown>[]
    } else if (data && typeof data === 'object') {
      const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray) as unknown[][]
      arr = arrays.length === 1 ? arrays[0] as Record<string, unknown>[] : []
    } else {
      arr = []
    }
    return arr.map((item, i) => ({
      index: i,
      name: String(item.name ?? item.title ?? item.url ?? `Položka ${i + 1}`),
      raw: item,
    }))
  }

  function initStep2Selection() {
    if (step2Initialized.value) return
    const selected: Record<string, boolean> = {}
    for (const item of step2Items()) selected[String(item.index)] = true
    step2SelectedItems.value = selected
    step2Initialized.value = true
  }

  function step2SelectAll() {
    const selected = { ...step2SelectedItems.value }
    for (const item of step2Items()) selected[String(item.index)] = true
    step2SelectedItems.value = selected
  }

  function step2DeselectAll() {
    const selected = { ...step2SelectedItems.value }
    for (const item of step2Items()) selected[String(item.index)] = false
    step2SelectedItems.value = selected
  }

  function step2SelectedCount() {
    return step2Items().filter(item => step2SelectedItems.value[String(item.index)]).length
  }

  watch(activeStep, (val) => {
    if (val === 'PARTNER_IDENTIFICATION') initStep2Selection()
    if (val === 'PARTNER_PROFILING') initStep3Selection()
    if (val === 'VALUE_ALIGNMENT') initStep4Selection()
    if (val === 'OUTREACH_PREPARATION') initStep5Selection()
    if (val === 'OUTREACH_EXECUTION') {
      if (!step6SelectedPartnerName.value && outreachEmails().length > 0) {
        const first = outreachEmails()[0]
        const name = String(first.partnerName ?? first.name ?? '')
        step6SelectedPartnerName.value = name
        initStep6Preview(name)
      }
    }
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
    const done = new Set(
      profilingOutputProfiles('PARTNER_PROFILING').map(p =>
        String(p.partnerId ?? p.name ?? '').toLowerCase(),
      ),
    )
    const selected: Record<string, boolean> = {}
    for (const candidate of step3Candidates()) {
      const isProcessed = done.has(candidate.partnerId.toLowerCase()) || done.has(candidate.name.toLowerCase())
      selected[candidate.partnerId] = !isProcessed
    }
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

  function step3SelectUnprocessed() {
    const done = new Set(
      profilingOutputProfiles('PARTNER_PROFILING').map(p =>
        String(p.partnerId ?? p.name ?? '').toLowerCase(),
      ),
    )
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3FilteredCandidates()) {
      const isProcessed = done.has(candidate.partnerId.toLowerCase()) || done.has(candidate.name.toLowerCase())
      selected[candidate.partnerId] = !isProcessed
    }
    step3SelectedIds.value = selected
  }

  function step3FilteredCandidates() {
    return step3Candidates().filter(candidate => candidate.frequency >= step3FreqFilter.value)
  }

  function step3SelectedCount() {
    return step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId]).length
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

  const PLACEHOLDER_CONTEXT = '<[[CONTEXT]]>'
  const PLACEHOLDER_DATA = '<[[DATA]]>'

  function buildFullPrompt(stepKey: string, userMessage: string): string {
    const cfg = getConfig(stepKey)
    const systemPrompt = selectedPrompt(stepKey)
    const systemContent = systemPrompt?.content ?? STEP_SYSTEM_PROMPTS[stepKey] ?? ''

    const selectedCtxParts = contextParts.value.filter(cp => cfg.contextPartIds.includes(cp.id))
    const contextBlock = selectedCtxParts.length
      ? selectedCtxParts.map(cp => `## ${cp.name}\n${cp.content}`).join('\n\n')
      : ''

    const hasContextPh = systemContent.includes(PLACEHOLDER_CONTEXT)
    const hasDataPh = systemContent.includes(PLACEHOLDER_DATA)

    if (hasContextPh || hasDataPh) {
      let result = systemContent
      if (hasContextPh) result = result.replace(PLACEHOLDER_CONTEXT, contextBlock)
      if (hasDataPh) result = result.replace(PLACEHOLDER_DATA, userMessage)
      if (!hasDataPh) result = result + '\n\n---\n\n' + userMessage
      return result
    }

    const parts: string[] = [systemContent]
    if (contextBlock) parts.push(contextBlock)
    parts.push(userMessage)
    return parts.join('\n\n---\n\n')
  }

  function step1CopyPrompt(stepKey: string): string {
    return buildFullPrompt(stepKey, `Research this topic/industry:\n\n{}`)
  }

  function step3PartnerCopyPrompt(stepKey: string, partner: Step3Candidate): string {
    const lines = [
      'Proveď průzkum tohoto potenciálního partnera a vrať strukturovaný JSON definovaný v systémovém promptu:',
      '',
      `Jméno: ${partner.name}`,
      `Nalezen v ${partner.frequency} kontextu(ch): ${partner.itemNames.join(', ')}`,
    ]
    return buildFullPrompt(stepKey, lines.join('\n'))
  }

  function step4CopyPrompt(stepKey: string): string {
    const selected = profilingOutputProfiles('PARTNER_PROFILING')
      .filter(p => step4SelectedIds.value[String(p.name ?? '')])
    if (selected.length === 0) return buildFullPrompt(stepKey, 'Žádní partneři nevybráni.')
    const userMsg = selected.map(p => [
      `Analyzuj soulad pro partnera: ${p.name}`,
      '```json',
      JSON.stringify(p, null, 2),
      '```',
    ].join('\n')).join('\n\n')
    return buildFullPrompt(stepKey, userMsg)
  }

  function step4PartnerCopyPrompt(stepKey: string, partnerName: string): string {
    const profile = profilingOutputProfiles('PARTNER_PROFILING').find(p => String(p.name) === partnerName)
    const userMsg = [
      'Analyzuj soulad mezi tímto partnerem a našimi prodejními argumenty. Vrať strukturovaný JSON dle systémového promptu.',
      '',
      'Profil partnera:',
      '```json',
      JSON.stringify(profile ?? { name: partnerName }, null, 2),
      '```',
    ].join('\n')
    return buildFullPrompt(stepKey, userMsg)
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

  async function deleteTableRows(stepKey: string, rowIndices: number[]) {
    const result = getStepResult(stepKey)
    if (!result) return
    const table = resolveTable(stepKey)
    if (!table) return
    const indexSet = new Set(rowIndices)
    const newRows = table.rows.filter((_, i) => !indexSet.has(i))
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

  async function deletePartnerItem(stepKey: string, itemIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const data = result.outputData as { items?: PartnerResultItem[] }
    const newItems = (data.items ?? []).filter((_, i) => i !== itemIndex)
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: { ...data, items: newItems } },
    })
    await refresh()
  }

  async function deletePartnerCandidate(stepKey: string, candidateName: string) {
    const result = getStepResult(stepKey)
    if (!result) return
    const data = result.outputData as { items?: PartnerResultItem[] }
    const key = candidateName.toLowerCase().trim()
    const newItems = (data.items ?? []).map(item => ({
      ...item,
      partners: (item.partners ?? []).filter(p => p.name.toLowerCase().trim() !== key),
    }))
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: { ...data, items: newItems } },
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

    if (stepKey === 'PARTNER_IDENTIFICATION') {
      const selectedItems = step2Items()
        .filter(item => step2SelectedItems.value[String(item.index)])
        .map(item => item.raw)
      if (selectedItems.length === 0) {
        alert('Vyberte alespoň jednu položku ke zpracování.')
        return
      }
      inputData = { items: selectedItems }
    } else if (stepKey === 'PARTNER_PROFILING') {
      const allSelected = step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId])
      if (allSelected.length === 0) {
        alert('Vyberte alespoň jednoho partnera k prozkoumání.')
        return
      }
      inputData = { partners: allSelected }
    } else if (stepKey === 'VALUE_ALIGNMENT') {
      const cfg = getConfig(stepKey)
      if (!cfg.sellingPointId) return
      const allProfiles = profilingOutputProfiles('PARTNER_PROFILING')
      const selected = allProfiles.filter(p => step4SelectedIds.value[String(p.name ?? '')])
      if (selected.length === 0) {
        alert('Vyberte alespoň jednoho partnera k analýze.')
        return
      }
      inputData = { partners: selected }
    } else if (stepKey === 'OUTREACH_PREPARATION') {
      const cfg = getConfig(stepKey)
      if (!cfg.emailDraftId) {
        alert('Vyberte e-mailovou šablonu z knihovny.')
        return
      }
      const selectedAlignments = step5Alignments()
        .filter(a => step5SelectedIds.value[String(a.name ?? '')])
      if (selectedAlignments.length === 0) {
        alert('Vyberte alespoň jednoho partnera pro přípravu oslovení.')
        return
      }
      inputData = { partners: selectedAlignments }
    } else if (stepKey === 'OUTREACH_EXECUTION') {
      if (!step6PreviewTo.value || !step6PreviewSubject.value || !step6PreviewBody.value) {
        alert('Vyplňte příjemce, předmět a tělo e-mailu v náhledu.')
        return
      }
      inputData = {
        to: step6PreviewTo.value,
        subject: step6PreviewSubject.value,
        body: step6PreviewBody.value,
        partnerName: step6SelectedPartnerName.value,
      }
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
    alignmentProgress.value[stepKey] = []
    let response: Response
    try {
      response = await fetch(`/api/pipeline/${route.params.id}/steps/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepType: stepKey,
          systemPromptId: cfg.systemPromptId || undefined,
          contextPartIds: cfg.contextPartIds.length ? cfg.contextPartIds : undefined,
          manualContext: cfg.manualContext || undefined,
          sellingPointId: cfg.sellingPointId || undefined,
          emailDraftId: cfg.emailDraftId || undefined,
          inputData,
        }),
      })
    } catch {
      executingStep.value = null
      alert('Chyba sítě — nelze se připojit k serveru.')
      return
    }

    if (!response.ok) {
      executingStep.value = null
      const text = await response.text().catch(() => response.statusText)
      alert(`Nepodařilo se spustit krok: ${text}`)
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
            if (data.alignmentItem) {
              updateAlignmentItem(stepKey, data.alignmentItem)
            }
            if (data.error) {
              alert(`Step failed: ${data.error}`)
            }
            if (data.done) {
              if (stepKey === 'MARKET_SCANNING') step2Initialized.value = false
              if (stepKey === 'PARTNER_PROFILING') step4Initialized.value = false
              if (stepKey === 'OUTREACH_PREPARATION') step5Initialized.value = false
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
    emailDrafts,
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
    step2SelectedItems,
    step2Initialized,
    partnerProgress,
    profilingProgress,
    alignmentProgress,
    step3SelectedIds,
    step3FreqFilter,
    step3Initialized,
    step4SelectedIds,
    step4Initialized,
    step5SelectedIds,
    step5Initialized,
    step6SelectedPartnerName,
    step6PreviewTo,
    step6PreviewSubject,
    step6PreviewBody,
    expandedProfileName,
    promptPreviewStep,
    outputViewMode,
    copiedPromptKey,
    candidateHoverIdx,
    getConfig,
    saveContextPartToLibrary,
    isAiImportStep,
    toggleAiImport,
    runAiImport,
    deleteTableRow,
    deleteTableRows,
    deleteProfilingProfile,
    deletePartnerItem,
    deletePartnerCandidate,
    startEditOutput,
    cancelEditOutput,
    requestSaveOutput,
    confirmSaveOutput,
    step2Items,
    initStep2Selection,
    step2SelectAll,
    step2DeselectAll,
    step2SelectedCount,
    step3Candidates,
    initStep3Selection,
    step3SelectAll,
    step3DeselectAll,
    step3SelectUnprocessed,
    step3FilteredCandidates,
    step3SelectedCount,
    updateProfilingItem,
    profilingOutputProfiles,
    step4Partners,
    initStep4Selection,
    step4SelectAll,
    step4DeselectAll,
    step4SelectUnprocessed,
    step4SelectedCount,
    step5Alignments,
    initStep5Selection,
    step5SelectAll,
    step5DeselectAll,
    step5SelectedCount,
    outreachEmails,
    initStep6Preview,
    updatePartnerItem,
    updateAlignmentItem,
    alignmentOutputAlignments,
    step4PartnerCopyPrompt,
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
    step4CopyPrompt,
    copyDeepResearchPrompt,
  }) as PipelineRunContext


  return pipeline
}
