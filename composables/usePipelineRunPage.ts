import { STEP_MODEL, MODEL_BADGE, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'
import { useProgressTracking } from './pipeline/useProgressTracking'
import { useOutputUtils } from './pipeline/useOutputUtils'
import { useOutputEdit } from './pipeline/useOutputEdit'
import { useSelectionState } from './pipeline/useSelectionState'
import { useAiImport } from './pipeline/useAiImport'
import { usePromptBuilding } from './pipeline/usePromptBuilding'
import { useStepExecution } from './pipeline/useStepExecution'
import type { PipelineRunContext, PipelineRunResponse, RunStepResult, StepConfigState, PiExtraRef } from './pipeline/types'

export { type PipelineRunContext } from './pipeline/types'

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

export const pipelineRunKey = Symbol('pipelineRun')

export async function usePipelineRunPage() {
  const route = useRoute()
  const [runResult, promptsResult, contextPartsResult, sellingPointsResult, emailDraftsResult, signaturesResult] = await Promise.all([
    useFetch<PipelineRunResponse>(`/api/pipeline/${route.params.id}`),
    useFetch<PromptOption[]>('/api/library/prompts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; content: string; stepKeys: string[] }>>('/api/library/context-parts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string }>>('/api/library/selling-points', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; subject: string; body: string }>>('/api/library/email-drafts', { default: () => [] }),
    useFetch<Array<{ id: string; name: string; content: string; isDefault: boolean }>>('/api/library/signatures', { default: () => [] }),
  ])
  const { data: run, refresh } = runResult
  const { data: prompts } = promptsResult
  const { data: contextParts } = contextPartsResult
  const { data: sellingPoints } = sellingPointsResult
  const { data: emailDrafts } = emailDraftsResult
  const { data: signatures } = signaturesResult

  const activeStep = ref<string | null>(null)
  const executingStep = ref<string | null>(null)
  const streamOutputs = ref<Record<string, string>>({})

  const expandedProfileName = ref<string | null>(null)
  const promptPreviewStep = ref<string | null>(null)
  const candidateHoverIdx = ref<number | null>(null)

  const stepConfig = ref<Record<string, StepConfigState>>({})

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

  function getStepResult(stepKey: string): RunStepResult | undefined {
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

  function selectedPrompt(stepKey: string) {
    const id = getConfig(stepKey).systemPromptId
    if (!id) return null
    return prompts.value.find(p => p.id === id) ?? null
  }

  function modelBadge(stepKey: string) {
    return MODEL_BADGE[STEP_MODEL[stepKey] ?? ''] ?? { label: stepKey, cls: 'bg-gray-100 text-gray-500' }
  }

  // ── Sub-composables ──────────────────────────────────────────────────────────

  const progress = useProgressTracking()

  const outputUtils = useOutputUtils(run, getStepResult)

  const outputEdit = useOutputEdit(
    run,
    route,
    refresh,
    getStepResult,
    outputUtils.resolveTable,
    outputUtils.profilingOutputProfiles,
  )

  // PI record refs added via Import / global DB — synced from canvas step records (useOverlayStepsInput)
  const piExtraRefs = ref<PiExtraRef[]>([])

  const selection = useSelectionState(
    getStepResult,
    outputUtils.profilingOutputProfiles,
    outputUtils.alignmentOutputAlignments,
    outputUtils.outreachEmails,
    outputUtils.partnerItems,
    () => piExtraRefs.value,
  )

  const aiImport = useAiImport(route, refresh, getConfig)

  const promptBuilding = usePromptBuilding(
    contextParts,
    getConfig,
    selectedPrompt,
    outputUtils.profilingOutputProfiles,
    selection.step4SelectedIds,
    STEP_SYSTEM_PROMPTS,
  )

  const { executeStep } = useStepExecution(
    route,
    refresh,
    getConfig,
    selection.step2Items,
    selection.step2SelectedItems,
    selection.step3FilteredCandidates,
    selection.step3SelectedIds,
    selection.step4SelectedIds,
    outputUtils.profilingOutputProfiles,
    selection.step5Alignments,
    selection.step5SelectedIds,
    outputUtils.outreachEmails,
    selection.step6PreviewTo,
    selection.step6PreviewSubject,
    selection.step6PreviewBody,
    selection.step6SelectedPartnerName,
    executingStep,
    streamOutputs,
    progress.partnerProgress,
    progress.profilingProgress,
    progress.alignmentProgress,
    progress.updatePartnerItem,
    progress.updateProfilingItem,
    progress.updateAlignmentItem,
    selection.step2Initialized,
    selection.step4Initialized,
    selection.step5Initialized,
  )

  function prevStepOutput(stepKey: string): string {
    return outputUtils.prevStepOutput(stepKey, STEPS)
  }

  function stepResultOutput(stepKey: string): string {
    return outputUtils.stepResultOutput(stepKey)
  }

  // ── Step 6 signature helpers ─────────────────────────────────────────────────

  const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

  // Base body (without the appended signature portion)
  const step6BaseBody = ref('')

  function applySignatureToBody(baseBody: string, signatureContent: string): string {
    if (!signatureContent) return baseBody
    return baseBody + SIGNATURE_SEPARATOR + signatureContent
  }

  function initStep6Preview(partnerName: string) {
    selection.initStep6Preview(partnerName)
    const base = selection.step6PreviewBody.value
    step6BaseBody.value = base
    const defaultSig = signatures.value.find(s => s.isDefault)
    if (defaultSig) {
      selection.step6PreviewBody.value = applySignatureToBody(base, defaultSig.content)
    }
  }

  function applySignature(signatureId: string) {
    const sig = signatureId ? signatures.value.find(s => s.id === signatureId) : null
    selection.step6PreviewBody.value = sig
      ? applySignatureToBody(step6BaseBody.value, sig.content)
      : step6BaseBody.value
  }

  // ── Watch activeStep ─────────────────────────────────────────────────────────

  watch(activeStep, (val) => {
    if (val === 'PARTNER_IDENTIFICATION') selection.initStep2Selection()
    if (val === 'PARTNER_PROFILING') selection.initStep3Selection()
    if (val === 'VALUE_ALIGNMENT') selection.initStep4Selection()
    if (val === 'OUTREACH_PREPARATION') selection.initStep5Selection()
    if (val === 'OUTREACH_EXECUTION') {
      if (!selection.step6SelectedPartnerName.value && outputUtils.outreachEmails().length > 0) {
        const first = outputUtils.outreachEmails()[0]
        const name = String(first.partnerName ?? first.name ?? '')
        selection.step6SelectedPartnerName.value = name
        initStep6Preview(name)
      }
    }
  })

  // ── Assemble context ─────────────────────────────────────────────────────────

  const pipeline = reactive({
    route,
    run,
    refresh,
    steps: STEPS,
    prompts,
    contextParts,
    sellingPoints,
    emailDrafts,
    signatures,
    activeStep,
    executingStep,
    streamOutputs,
    expandedProfileName,
    promptPreviewStep,
    candidateHoverIdx,
    // progress
    ...progress,
    // output utils
    outputViewMode: outputUtils.outputViewMode,
    getOutputMode: outputUtils.getOutputMode,
    setOutputMode: outputUtils.setOutputMode,
    resolveTable: outputUtils.resolveTable,
    tableColumns: outputUtils.tableColumns,
    profilingOutputProfiles: outputUtils.profilingOutputProfiles,
    alignmentOutputAlignments: outputUtils.alignmentOutputAlignments,
    outreachEmails: outputUtils.outreachEmails,
    partnerItems: outputUtils.partnerItems,
    candidateList: outputUtils.candidateList,
    stepResultOutput,
    prevStepOutput,
    // output edit
    ...outputEdit,
    // selection
    step2SelectedItems: selection.step2SelectedItems,
    step2Initialized: selection.step2Initialized,
    step2Items: selection.step2Items,
    initStep2Selection: selection.initStep2Selection,
    step2SelectAll: selection.step2SelectAll,
    step2DeselectAll: selection.step2DeselectAll,
    step2SelectedCount: selection.step2SelectedCount,
    piExtraRefs,
    step3SelectedIds: selection.step3SelectedIds,
    step3FreqFilter: selection.step3FreqFilter,
    step3Initialized: selection.step3Initialized,
    step3Candidates: selection.step3Candidates,
    initStep3Selection: selection.initStep3Selection,
    step3SelectAll: selection.step3SelectAll,
    step3DeselectAll: selection.step3DeselectAll,
    step3SelectUnprocessed: selection.step3SelectUnprocessed,
    step3FilteredCandidates: selection.step3FilteredCandidates,
    step3SelectedCount: selection.step3SelectedCount,
    step4SelectedIds: selection.step4SelectedIds,
    step4Initialized: selection.step4Initialized,
    step4Partners: selection.step4Partners,
    initStep4Selection: selection.initStep4Selection,
    step4SelectAll: selection.step4SelectAll,
    step4DeselectAll: selection.step4DeselectAll,
    step4SelectUnprocessed: selection.step4SelectUnprocessed,
    step4SelectedCount: selection.step4SelectedCount,
    step5SelectedIds: selection.step5SelectedIds,
    step5Initialized: selection.step5Initialized,
    step5Alignments: selection.step5Alignments,
    initStep5Selection: selection.initStep5Selection,
    step5SelectAll: selection.step5SelectAll,
    step5DeselectAll: selection.step5DeselectAll,
    step5SelectedCount: selection.step5SelectedCount,
    step6SelectedPartnerName: selection.step6SelectedPartnerName,
    step6PreviewTo: selection.step6PreviewTo,
    step6PreviewSubject: selection.step6PreviewSubject,
    step6PreviewBody: selection.step6PreviewBody,
    initStep6Preview,
    applySignature,
    // ai import
    ...aiImport,
    // prompt building
    ...promptBuilding,
    // orchestrator-level functions
    getConfig,
    saveContextPartToLibrary,
    getStepResult,
    promptsForStep,
    stepResultStatus,
    stepResultRunnerName,
    stepResultPromptName,
    selectedPrompt,
    modelBadge,
    executeStep,
  }) as unknown as PipelineRunContext

  return pipeline
}
