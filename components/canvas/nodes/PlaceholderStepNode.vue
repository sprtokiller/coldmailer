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
    sources: Array<unknown>
  }
}>()

const canvas = inject(canvasKey)!

const isSelected = computed(() => canvas.selectedNodeId.value === props.id)
const isDimmed = computed(() => canvas.dimmedNodeIds.value.has(props.id))

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  RUNNING:   { cls: 'bg-blue-100 text-blue-700',   label: 'Běží' },
  FAILED:    { cls: 'bg-red-100 text-red-700',     label: 'Chyba' },
  PENDING:   { cls: 'bg-gray-100 text-gray-400',   label: 'Čeká' },
  COMPLETED: { cls: 'bg-green-100 text-green-700', label: 'Hotovo' },
}

const STEP_NUMBERS: Record<string, string> = {
  PARTNER_PROFILING:    'Krok 3',
  VALUE_ALIGNMENT:      'Krok 4',
  OUTREACH_PREPARATION: 'Krok 5',
  OUTREACH_EXECUTION:   'Krok 6',
}

const OUTPUT_LABELS: Record<string, string> = {
  PARTNER_PROFILING:    'profilů',
  VALUE_ALIGNMENT:      'alignmentů',
  OUTREACH_PREPARATION: 'e-mailů',
  OUTREACH_EXECUTION:   'odesláno',
}

const total = computed(() => props.data.recordCounts.total)
const outputLabel = computed(() => OUTPUT_LABELS[props.data.stepType] ?? 'záznamů')
const isLast = computed(() => props.data.stepType === 'OUTREACH_EXECUTION')
</script>

<template>
  <div
    :class="[
      'bg-white border rounded-xl shadow-sm w-64 cursor-pointer transition-all duration-150',
      isSelected ? 'border-indigo-400 ring-2 ring-indigo-300 shadow-md' : 'border-gray-200 hover:border-gray-300',
      isDimmed ? 'opacity-40' : '',
    ]"
  >
    <Handle type="target" :position="Position.Left" class="!bg-gray-300" />

    <div class="p-4">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">{{ STEP_NUMBERS[data.stepType] ?? '' }}</span>
        <span v-if="STATUS_BADGES[data.status] && (data.status === 'RUNNING' || data.status === 'FAILED')" :class="['text-xs px-2 py-0.5 rounded-full font-medium', STATUS_BADGES[data.status].cls]">
          {{ STATUS_BADGES[data.status].label }}
        </span>
        <span v-else-if="total > 0" class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600">
          {{ total }} {{ outputLabel }}
        </span>
      </div>
      <h3 class="text-sm font-semibold text-gray-800">{{ data.label }}</h3>
      <button
        v-if="total === 0"
        class="mt-2 w-full text-xs py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium"
        @click.stop="canvas.openOverlay(id, data.stepId, data.stepType)"
      >▶ Spustit krok</button>
    </div>

    <Handle v-if="!isLast" type="source" :position="Position.Right" class="!bg-gray-300" />
  </div>
</template>
