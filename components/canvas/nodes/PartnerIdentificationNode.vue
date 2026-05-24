<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { canvasKey } from '~/composables/usePipelineCanvas'

const props = defineProps<{
  id: string
  data: {
    stepId: string | null
    stepType: string
    label: string
    status: string
    recordCounts: { relevant: number; irrelevant: number; uncertain: number; total: number }
    sources: Array<{ id: string; label: string; type: string; createdAt: string | Date }>
  }
}>()

const canvas = inject(canvasKey)!

const isSelected = computed(() => canvas.selectedNodeId.value === props.id)
const isDimmed = computed(() => canvas.dimmedNodeIds.value.has(props.id))

const STATUS_RUNNING_FAILED: Record<string, { cls: string; label: string }> = {
  RUNNING: { cls: 'bg-blue-100 text-blue-700', label: 'Běží' },
  FAILED:  { cls: 'bg-red-100 text-red-700',  label: 'Chyba' },
}

function runCountLabel(n: number) {
  if (n === 1) return '1 spuštění'
  if (n >= 2 && n <= 4) return `${n} spuštění`
  return `${n} spuštění`
}

const total = computed(() => props.data.recordCounts.total)

function onSourceClick(e: MouseEvent, sourceId: string) {
  e.stopPropagation()
  canvas.openSourceFilter(props.data.stepId, props.data.stepType, props.id, sourceId)
}
</script>

<template>
  <div
    :class="[
      'bg-white border rounded-xl shadow-sm w-64 cursor-pointer transition-all duration-150',
      isSelected ? 'border-indigo-400 ring-2 ring-indigo-300 shadow-md' : 'border-gray-200 hover:border-indigo-300',
      isDimmed ? 'opacity-40' : '',
    ]"
  >
    <Handle type="target" :position="Position.Left" class="!bg-indigo-400" />

    <div class="p-4 border-b border-gray-100">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">Krok 2</span>
        <span v-if="STATUS_RUNNING_FAILED[data.status]" :class="['text-xs px-2 py-0.5 rounded-full font-medium', STATUS_RUNNING_FAILED[data.status].cls]">
          {{ STATUS_RUNNING_FAILED[data.status].label }}
        </span>
        <span v-else-if="data.sources.length > 0" class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600">
          {{ runCountLabel(data.sources.length) }}
        </span>
      </div>
      <h3 class="text-sm font-semibold text-gray-800">{{ data.label }}</h3>
    </div>

    <!-- Flow cards — each clickable to filter overlay -->
    <div v-if="data.sources.length > 0" class="px-3 py-2 space-y-1 border-b border-gray-100">
      <button
        v-for="src in data.sources"
        :key="src.id"
        class="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg px-2 py-1 transition-colors text-left"
        @click="onSourceClick($event, src.id)"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"></span>
        <span class="truncate">{{ src.label }}</span>
      </button>
    </div>

    <div class="p-4">
      <div v-if="total > 0" class="text-xs text-gray-400">
        {{ total }} partnerů
      </div>
      <div v-else class="text-xs text-gray-400 text-center py-2">Žádní partneři · klikněte pro spuštění</div>
    </div>

    <Handle type="source" :position="Position.Right" class="!bg-indigo-400" />
  </div>
</template>
