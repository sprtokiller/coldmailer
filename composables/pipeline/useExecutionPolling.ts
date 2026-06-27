import type { Ref } from 'vue'
import type { PartnerProgressItem, ProfilingProgressItem, AlignmentProgressItem } from './types'

const POLL_INTERVAL_MS = 3000

export interface RunningJobInfo {
  id: string
  stepType: string
  runnerName: string
  runnerImage: string | null
  createdAt: string
  progress: { items: Array<Record<string, unknown>> } | null
}

interface RunningStepResponse {
  runningSteps: RunningJobInfo[]
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
  let previousCount = 0
  let refreshing = false

  const runningJobs = ref<RunningJobInfo[]>([])

  async function poll() {
    try {
      const data = await $fetch<RunningStepResponse>(`/api/pipeline/${runId}/execution-status`)
      const steps = data.runningSteps

      if (steps.length > 0) {
        runningJobs.value = steps
        previousCount = steps.length

        // Use first step as primary for legacy executingStep/executingRunner display
        const primary = steps[0]
        executingStep.value = primary.stepType
        executingRunner.value = { name: primary.runnerName, image: primary.runnerImage }

        for (const rs of steps) {
          if (rs.progress?.items) {
            applyProgress(rs.stepType, rs.progress.items)
          }
        }
      } else if (previousCount > 0 && !refreshing) {
        previousCount = 0
        runningJobs.value = []
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

  return { runningJobs }
}
