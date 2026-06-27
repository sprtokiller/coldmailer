<script setup lang="ts">
import { pipelineRunKey, type usePipelineRunPage, STEPS } from '~/composables/usePipelineRunPage'

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const STEP_LABELS: Record<string, string> = Object.fromEntries(STEPS.map(s => [s.key, s.label]))

const now = ref(Date.now())
let tickId: ReturnType<typeof setInterval> | null = null

onMounted(() => { tickId = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (tickId) clearInterval(tickId) })

function elapsedLabel(createdAt: string): string {
  const secs = Math.floor((now.value - new Date(createdAt).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `${mins}m ${rem}s`
}

function progressLabel(progress: { items?: Array<{ status: string }> } | null): string {
  const items = progress?.items ?? []
  if (items.length === 0) return ''
  const done = items.filter(i => i.status === 'done' || i.status === 'error').length
  return `${done}/${items.length}`
}

const cancelling = ref<Set<string>>(new Set())

async function cancelJob(stepId: string) {
  if (cancelling.value.has(stepId)) return
  cancelling.value = new Set([...cancelling.value, stepId])
  try {
    await $fetch(`/api/pipeline/${pipeline.route.params.id}/steps/${stepId}/cancel`, { method: 'POST' })
    await pipeline.refresh()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    alert(`Chyba při zrušení: ${msg}`)
  } finally {
    cancelling.value = new Set([...cancelling.value].filter(id => id !== stepId))
  }
}
</script>

<template>
  <div
    v-if="pipeline.runningJobs.length > 0"
    class="absolute bottom-4 left-4 z-40 flex flex-col gap-2"
  >
    <div
      v-for="job in pipeline.runningJobs"
      :key="job.id"
      class="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-xs"
    >
      <!-- Spinner -->
      <svg class="w-4 h-4 text-primary flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>

      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-gray-800 truncate">{{ STEP_LABELS[job.stepType] ?? job.stepType }}</p>
        <p class="text-[10px] text-gray-400 leading-tight">
          {{ job.runnerName }} · {{ elapsedLabel(job.createdAt) }}
          <span v-if="progressLabel(job.progress as any)" class="ml-1 text-gray-500">· {{ progressLabel(job.progress as any) }}</span>
        </p>
      </div>

      <button
        :disabled="cancelling.has(job.id)"
        class="flex-shrink-0 text-[10px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
        @click="cancelJob(job.id)"
      >
        {{ cancelling.has(job.id) ? '…' : 'Zrušit' }}
      </button>
    </div>
  </div>
</template>
