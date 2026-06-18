import type { Ref } from 'vue'
import type { PartnerProgressItem, ProfilingProgressItem, AlignmentProgressItem } from './types'

const POLL_INTERVAL_MS = 3000

interface RunningStepResponse {
  runningStep: {
    id: string
    stepType: string
    runnerName: string
    runnerImage: string | null
    createdAt: string
    progress: { items: Array<Record<string, unknown>> } | null
  } | null
}

const PROFILING_STEP_TYPES = new Set(['PARTNER_PROFILING', 'OUTREACH_PREPARATION'])
const PARTNER_ID_STEP_TYPE = 'PARTNER_IDENTIFICATION'

export function useExecutionPolling(
  runId: string,
  executingStep: Ref<string | null>,
  executingRunner: Ref<{ name: string; image: string | null } | null>,
  partnerProgress: Ref<Record<string, PartnerProgressItem[]>>,
  profilingProgress: Ref<Record<string, ProfilingProgressItem[]>>,
  alignmentProgress: Ref<Record<string, AlignmentProgressItem[]>>,
  updatePartnerItem: (stepKey: string, item: PartnerProgressItem) => void,
  updateProfilingItem: (stepKey: string, item: ProfilingProgressItem) => void,
  updateAlignmentItem: (stepKey: string, item: AlignmentProgressItem) => void,
  refresh: () => Promise<void>,
) {
  let intervalId: ReturnType<typeof setInterval> | null = null
  let previousStepType: string | null = null
  let refreshing = false

  async function poll() {
    try {
      const data = await $fetch<RunningStepResponse>(`/api/pipeline/${runId}/execution-status`)

      if (data.runningStep) {
        const { stepType, runnerName, runnerImage, progress } = data.runningStep
        previousStepType = stepType
        executingStep.value = stepType
        executingRunner.value = { name: runnerName, image: runnerImage }

        if (progress?.items) {
          applyProgress(stepType, progress.items)
        }
      } else if (previousStepType !== null && !refreshing) {
        previousStepType = null
        executingStep.value = null
        executingRunner.value = null
        refreshing = true
        try {
          await refresh()
        } finally {
          refreshing = false
        }
      }
    } catch {
      // Silently skip failed polls (network errors, auth issues)
    }
  }

  function applyProgress(stepType: string, items: Array<Record<string, unknown>>) {
    if (stepType === PARTNER_ID_STEP_TYPE) {
      for (const item of items) {
        updatePartnerItem(stepType, item as unknown as PartnerProgressItem)
      }
    } else if (stepType === 'VALUE_ALIGNMENT') {
      for (const item of items) {
        updateAlignmentItem(stepType, item as unknown as AlignmentProgressItem)
      }
    } else if (PROFILING_STEP_TYPES.has(stepType)) {
      for (const item of items) {
        updateProfilingItem(stepType, item as unknown as ProfilingProgressItem)
      }
    }
  }

  onMounted(() => {
    poll()
    intervalId = setInterval(poll, POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  })
}
