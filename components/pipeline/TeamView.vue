<script setup lang="ts">
import { canvasKey, usePipelineCanvas } from '~/composables/usePipelineCanvas'
import { overlayKey, useOverlay } from '~/composables/canvas/useOverlay'

const props = defineProps<{ runId: string; showRunPicker?: boolean }>()

const canvas = usePipelineCanvas(props.runId)
provide(canvasKey, canvas)

const overlay = useOverlay()
provide(overlayKey, overlay)

const activeTab = ref<'va' | 'outreach'>('va')

function openTab(tab: 'va' | 'outreach') {
  activeTab.value = tab
  const stepType = tab === 'va' ? 'VALUE_ALIGNMENT' : 'OUTREACH_PREPARATION'
  const node = canvas.nodes.value.find(n => n.data.stepType === stepType)
  if (node) {
    canvas.openOverlay(node.id, node.data.stepId, stepType)
  }
  if (tab === 'va') {
    overlay.switchMainTab('config')
  }
}

onMounted(async () => {
  await canvas.fetchCanvasData()
  openTab('va')
})

watch(() => canvas.nodes.value.length, (len) => {
  if (len > 0) openTab(activeTab.value)
})

// Run picker — always fetch unconditionally (composables can't be called conditionally)
// Data is reused from Nuxt's cache if already loaded elsewhere
const { data: allRuns } = useFetch('/api/pipeline', { default: () => [] })

const runs = computed(() => (props.showRunPicker ? (allRuns.value ?? []) : []))

const router = useRouter()
function switchRun(id: string) {
  router.push(`/outreach/${id}`)
}
</script>

<template>
  <div class="flex flex-col bg-white" style="height: calc(100vh - 120px)">
    <!-- Tab bar -->
    <div class="flex items-center border-b border-gray-200 px-6 shrink-0 gap-1">
      <button
        :class="[
          'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
          activeTab === 'va'
            ? 'border-indigo-500 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700',
        ]"
        @click="openTab('va')"
      >
        Value Alignment
      </button>
      <button
        :class="[
          'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
          activeTab === 'outreach'
            ? 'border-indigo-500 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700',
        ]"
        @click="openTab('outreach')"
      >
        Příprava oslovení
      </button>

      <!-- Run picker (shown only when showRunPicker prop is true) -->
      <div v-if="showRunPicker && runs.length > 1" class="ml-auto flex items-center gap-2">
        <span class="text-[11px] text-gray-400">Pipeline:</span>
        <select
          :value="runId"
          class="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
          @change="switchRun(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="run in runs" :key="run.id" :value="run.id">
            {{ run.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- VA tab: config left, results right -->
    <div v-if="activeTab === 'va'" class="flex flex-1 overflow-hidden min-h-0">
      <div class="w-96 border-r border-gray-100 shrink-0 overflow-y-auto">
        <CanvasStepDetailConfigTab />
      </div>
      <div class="flex-1 overflow-y-auto">
        <CanvasStepDetailOutputCards />
      </div>
    </div>

    <!-- Outreach tab -->
    <div v-if="activeTab === 'outreach'" class="flex-1 overflow-hidden min-h-0">
      <CanvasOutreachWorkspace :standalone="true" />
    </div>

    <PipelineJobsDashboard />
  </div>
</template>
