import { STEP_MODEL, MODEL_BADGE, STEP_SYSTEM_PROMPTS } from '~/config/pipeline'
import { useProgressTracking } from './pipeline/useProgressTracking'
import { useOutputUtils } from './pipeline/useOutputUtils'
import { useOutputEdit } from './pipeline/useOutputEdit'
import { useSelectionState } from './pipeline/useSelectionState'
import { useAiImport } from './pipeline/useAiImport'
import { usePromptBuilding } from './pipeline/usePromptBuilding'
import { useStepExecution } from './pipeline/useStepExecution'
import { useExecutionPolling } from './pipeline/useExecutionPolling'
import type { PipelineRunContext, PipelineRunResponse, RunStepResult, StepConfigState, PiExtraRef } from './pipeline/types'

export { type PipelineRunContext } from './pipeline/types'

export const STEPS = [
  { key: 'MARKET_SCANNING', label: 'Market Scanning', description: 'Najde relevantní kanály (např. středoškolské soutěže a jiné akce).' },
  { key: 'PARTNER_IDENTIFICATION', label: 'Partner Identification', description: 'SerpAPI + Playwright + AI – prochází každou tržní položku a hledá partnery.' },
  { key: 'PARTNER_PROFILING', label: 'Partner Profiling', description: 'Hloubkový průzkum konkrétního partnera včetně nalezení kontaktních osob.' },
  { key: 'VALUE_ALIGNMENT', label: 'Value Alignment', description: 'Seřadí prodejní argumenty podle relevance pro partnera.' },
  { key: 'OUTREACH_PREPARATION', label: 'Outreach Preparation', description: 'Vygeneruje přizpůsobený návrh e-mailu.' },
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
  const nuxtApp = useNuxtApp()
  const route = useRoute()

  const activeStep = ref<string | null>(null)
  const executingStep = ref<string | null>(null)
  const executingRunner = ref<{ name: string; image: string | null } | null>(null)
  const streamOutputs = ref<Record<string, string>>({})

  const expandedProfileName = ref<string | null>(null)
  const promptPreviewStep = ref<string | null>(null)
  const candidateHoverIdx = ref<number | null>(null)

  const stepConfig = ref<Record<string, StepConfigState>>({})
  const piExtraRefs = ref<PiExtraRef[]>([])

  const runResult = useFetch<PipelineRunResponse>(`/api/pipeline/${route.params.id}`)
  const { data: run, refresh } = runResult

  const libraryResult = useAsyncData(`pipeline-library-${route.params.id}`, async () => {
    await runResult
    const projectId = run.value?.projectId

    const [prompts, contextParts, sellingPoints, emailDrafts, signatures] = await Promise.all([
      $fetch<PromptOption[]>('/api/library/prompts', { query: { projectId } }),
      $fetch<Array<{ id: string; name: string; content: string; stepKeys: string[] }>>('/api/library/context-parts', { query: { projectId } }),
      $fetch<Array<{ id: string; name: string }>>('/api/library/selling-points', { query: { projectId } }),
      $fetch<Array<{ id: string; name: string; subject: string; body: string }>>('/api/library/email-drafts', { query: { projectId } }),
      $fetch<Array<{ id: string; name: string; content: string; isDefault: boolean }>>('/api/library/signatures')
    ])
    return { prompts, contextParts, sellingPoints, emailDrafts, signatures }
  }, {
    default: () => ({ prompts: [], contextParts: [], sellingPoints: [], emailDrafts: [], signatures: [] })
  })

  const prompts = ref(libraryResult.data.value?.prompts ?? [])
  const contextParts = ref(libraryResult.data.value?.contextParts ?? [])
  const sellingPoints = ref(libraryResult.data.value?.sellingPoints ?? [])
  const emailDrafts = ref(libraryResult.data.value?.emailDrafts ?? [])
  const signatures = ref(libraryResult.data.value?.signatures ?? [])

  // Update refs if data changes (e.g. on client hydration or navigation)
  watch(() => libraryResult.data.value, (newVal) => {
    if (newVal) {
      prompts.value = newVal.prompts
      contextParts.value = newVal.contextParts
      sellingPoints.value = newVal.sellingPoints
      emailDrafts.value = newVal.emailDrafts
      signatures.value = newVal.signatures
    }
  }, { deep: true })

  const activeSteps = computed(() => {
    if (run.value?.mode === 'short') {
      return STEPS.filter(s => s.key !== 'MARKET_SCANNING' && s.key !== 'PARTNER_IDENTIFICATION')
    }
    return STEPS
  })

  function getConfig(stepKey: string) {
    if (!stepConfig.value[stepKey]) {
      const lastSuccessful = run.value?.steps
        .filter((s) => s.stepType === stepKey && s.status === 'COMPLETED' && s.systemPromptId)
        .at(-1)

      const systemPrompt = prompts.value.find(p => p.stepType === stepKey && p.isSystem)

      const steps = activeSteps.value
      const idx = steps.findIndex(s => s.key === stepKey)
      let inputData = '{}'
      if (idx > 0) {
        const prevKey = steps[idx - 1].key
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
      body: {
        name,
        content: cfg.manualContext,
        stepKeys: [stepKey],
        projectId: run.value?.projectId,
      },
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

  const selection = useSelectionState(
    getStepResult,
    outputUtils.profilingOutputProfiles,
    outputUtils.alignmentOutputAlignments,
    outputUtils.outreachEmails,
    outputUtils.partnerItems,
    () => piExtraRefs.value,
  )

  const aiImport = useAiImport(route, refresh, getConfig)

  async function importProfiles(profiles: Array<Record<string, unknown>>) {
    await $fetch(`/api/pipeline/${route.params.id}/steps/import-profiles`, {
      method: 'POST',
      body: { profiles },
    })
    selection.step4Initialized.value = false
    await refresh()
  }

  const promptBuilding = usePromptBuilding(
    contextParts,
    getConfig,
    selectedPrompt,
    outputUtils.profilingOutputProfiles,
    selection.step4SelectedIds,
    STEP_SYSTEM_PROMPTS,
  )

  const { executeStep } = nuxtApp.runWithContext(() => useStepExecution(
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
    executingStep,
    executingRunner,
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
    getStepResult,
    outputUtils.alignmentOutputAlignments,
  ))

  function prevStepOutput(stepKey: string): string {
    return outputUtils.prevStepOutput(stepKey, activeSteps.value)
  }

  function stepResultOutput(stepKey: string): string {
    return outputUtils.stepResultOutput(stepKey)
  }

  function applySignature(_signatureId: string) {
    // Signature is now applied server-side in schedule-send
  }

  // ── Lifecycle hooks & watchers ───────────────
    useExecutionPolling(
      route.params.id as string,
      executingStep,
      executingRunner,
      progress.partnerProgress,
      progress.profilingProgress,
      progress.alignmentProgress,
      progress.updatePartnerItem,
      progress.updateProfilingItem,
      progress.updateAlignmentItem,
      refresh,
    )

    watch(activeStep, (val) => {
      if (val === 'PARTNER_IDENTIFICATION') selection.initStep2Selection()
      if (val === 'PARTNER_PROFILING') {
        selection.initStep3Selection()
      }
      if (val === 'VALUE_ALIGNMENT') {
        selection.initStep4Selection()
      }
      if (val === 'OUTREACH_PREPARATION') {
        selection.initStep5Selection()
      }
    })

    watch(
      () => outputUtils.profilingOutputProfiles('PARTNER_PROFILING'),
      () => {
        selection.step4Initialized.value = false
      },
      { deep: true }
    )

    watch(
      () => outputUtils.alignmentOutputAlignments('VALUE_ALIGNMENT'),
      () => {
        selection.step5Initialized.value = false
      },
      { deep: true }
    )

  // ── Assemble context ─────────────────────────────────────────────────────────

  const pipeline = reactive({
    route,
    run,
    refresh,
    steps: activeSteps,
    prompts,
    contextParts,
    sellingPoints,
    emailDrafts,
    signatures,
    activeStep,
    executingStep,
    executingRunner,
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
    step3IsCandidateProcessed: selection.step3IsCandidateProcessed,

    step4SelectedIds: selection.step4SelectedIds,
    step4Initialized: selection.step4Initialized,
    step4Partners: selection.step4Partners,
    initStep4Selection: selection.initStep4Selection,
    step4SelectAll: selection.step4SelectAll,
    step4DeselectAll: selection.step4DeselectAll,
    step4SelectUnprocessed: selection.step4SelectUnprocessed,
    step4SelectedCount: selection.step4SelectedCount,
    step4IsPartnerProcessed: selection.step4IsPartnerProcessed,

    step5SelectedIds: selection.step5SelectedIds,
    step5Initialized: selection.step5Initialized,
    step5Alignments: selection.step5Alignments,
    initStep5Selection: selection.initStep5Selection,
    step5SelectAll: selection.step5SelectAll,
    step5DeselectAll: selection.step5DeselectAll,
    step5SelectUnprocessed: selection.step5SelectUnprocessed,
    step5SelectedCount: selection.step5SelectedCount,
    applySignature,
    // ai import
    ...aiImport,
    importProfiles,
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

  await Promise.all([runResult, libraryResult])

  const d = libraryResult.data.value
  if (d) {
    prompts.value = d.prompts
    contextParts.value = d.contextParts
    sellingPoints.value = d.sellingPoints
    emailDrafts.value = d.emailDrafts
    signatures.value = d.signatures
  }

  return pipeline
}
