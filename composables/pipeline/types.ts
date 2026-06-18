import type { STEPS } from '~/composables/usePipelineRunPage'

export type StepDefinition = typeof STEPS[number]

export interface RunStepResult {
  id: string
  stepType: string
  status: string
  systemPromptId: string | null
  runner?: { name: string }
  systemPrompt?: { name: string }
  outputData?: unknown
  errorMessage?: unknown
}

export interface PipelineRunResponse {
  name: string
  author: { name: string }
  createdAt: string
  steps: RunStepResult[]
}

export interface StepConfigState {
  systemPromptId: string
  contextPartIds: string[]
  manualContext: string
  sellingPointId: string
  inputData: string
  emailDraftId: string
}

export interface PartnerResultItem {
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  partners?: Array<{ partnerId: string; name: string; isNew: boolean }>
  error?: string
}

export interface Step3Candidate {
  partnerId: string
  name: string
  frequency: number
  itemNames: string[]
  source: 'step2' | 'direct' | 'imported' | 'db'
}

// PI record ref added via AI import or global DB select — extra partner source for step 3
export interface PiExtraRef {
  globalRecordId: string
  name: string
  addMethod: string
  isSelectedForProcessing: boolean
  hasProfileData?: boolean
}

export interface RecordProfileCurrent {
  data: Record<string, unknown>
  updatedAt: string
}

export interface RecordProfileHistorical {
  stepId: string
  pipelineRunName: string
  runnerName: string
  completedAt: string
  data: Record<string, unknown>
}

export interface RecordProfilesResponse {
  current: RecordProfileCurrent | null
  historical: RecordProfileHistorical[]
}

export type PromptOption = {
  id: string
  name: string
  content: string
  stepType: string
  isSystem: boolean
  author: { name: string }
}

export interface PartnerProgressItem {
  index: number
  total: number
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  partnersFound?: number
  status: 'processing' | 'done' | 'error'
  error?: string
}

export interface ProfilingProgressItem {
  index: number
  total: number
  name: string
  status: 'processing' | 'done' | 'error'
  error?: string
  profile?: Record<string, unknown>
}

export interface AlignmentProgressItem {
  index: number
  total: number
  name: string
  status: 'processing' | 'done' | 'error'
  error?: string
  alignment?: Record<string, unknown>
}

export interface PipelineRunContext {
  route: ReturnType<typeof useRoute>
  run: PipelineRunResponse | null
  refresh: () => Promise<void>
  steps: typeof STEPS
  prompts: PromptOption[]
  contextParts: Array<{ id: string; name: string; content: string; stepKeys: string[] }>
  sellingPoints: Array<{ id: string; name: string }>
  emailDrafts: Array<{ id: string; name: string; subject: string; body: string }>
  signatures: Array<{ id: string; name: string; content: string; isDefault: boolean }>
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
  partnerProgress: Record<string, PartnerProgressItem[]>
  profilingProgress: Record<string, ProfilingProgressItem[]>
  alignmentProgress: Record<string, AlignmentProgressItem[]>
  step3SelectedIds: Record<string, boolean>
  step3FreqFilter: number
  step3Initialized: boolean
  piExtraRefs: PiExtraRef[]
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
  importProfiles: (profiles: Array<Record<string, unknown>>) => Promise<void>
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
  step3IsCandidateProcessed: (candidate: Step3Candidate) => boolean
  updateProfilingItem: (stepKey: string, item: ProfilingProgressItem) => void
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>
  step4Partners: () => Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }>
  initStep4Selection: () => void
  step4SelectAll: () => void
  step4DeselectAll: () => void
  step4SelectUnprocessed: () => void
  step4SelectedCount: () => number
  step4IsPartnerProcessed: (partner: { partnerId?: string; name: string }) => boolean
  step5Alignments: () => Array<Record<string, unknown>>
  initStep5Selection: () => void
  step5SelectAll: () => void
  step5DeselectAll: () => void
  step5SelectUnprocessed: () => void
  step5SelectedCount: () => number
  outreachEmails: () => Array<Record<string, unknown>>
  initStep6Preview: (partnerName: string) => void
  applySignature: (signatureId: string) => void
  updatePartnerItem: (stepKey: string, item: PartnerProgressItem) => void
  updateAlignmentItem: (stepKey: string, item: AlignmentProgressItem) => void
  alignmentOutputAlignments: (stepKey: string) => Array<Record<string, unknown>>
  step4PartnerCopyPrompt: (stepKey: string, partnerName: string) => string
  getStepResult: (stepKey: string) => RunStepResult | undefined
  promptsForStep: (stepKey: string) => PromptOption[]
  stepResultStatus: (stepKey: string) => string | undefined
  stepResultRunnerName: (stepKey: string) => string
  stepResultPromptName: (stepKey: string) => string | undefined
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
