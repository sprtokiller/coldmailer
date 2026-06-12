<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { canvasKey } from '~/composables/usePipelineCanvas'

const props = defineProps<{
  id: string
  data: {
    stepId: string | null
    stepType: string
    label: string
    addMethod: string
    total: number
    selected: number
    sources: Array<{ id: string; label: string; type: string; createdAt: string | Date }>
  }
}>()

const canvas = inject(canvasKey)!
const isSelected = computed(() => canvas.selectedNodeId.value === props.id)
const isDimmed = computed(() => canvas.dimmedNodeIds.value.has(props.id))

function onSourceClick(e: MouseEvent, sourceId: string) {
  e.stopPropagation()
  canvas.openSourceFilter(props.data.stepId, props.data.stepType, props.id, sourceId)
}

const CONFIG = {
  IMPORTED:  { icon: '↑', badge: 'bg-emerald-50 text-emerald-600', expanded: 'bg-emerald-100 text-emerald-700', hover: 'hover:bg-emerald-50 hover:text-emerald-600', border: 'border-emerald-200 hover:border-emerald-300', tag: 'text-emerald-500', dot: 'bg-emerald-400' },
  GLOBAL_DB: { icon: '⊕', badge: 'bg-rose-50 text-rose-600',       expanded: 'bg-rose-100 text-rose-700',       hover: 'hover:bg-rose-50 hover:text-rose-600',       border: 'border-rose-200 hover:border-rose-300',       tag: 'text-rose-400',   dot: 'bg-rose-400'    },
} as const

const cfg = computed(() => CONFIG[props.data.addMethod as keyof typeof CONFIG] ?? CONFIG.IMPORTED)
const unit = computed(() => props.data.stepType === 'PARTNER_IDENTIFICATION' ? 'partnerů' : 'soutěží')
const isSourceExpanded = (sourceId: string) => isSelected.value && canvas.expandedSourceIds.value.has(sourceId)
</script>

<template>
  <div
    :class="[
      'bg-white border rounded-xl shadow-sm w-64 cursor-pointer transition-all duration-150',
      canvas.selectedNodeBorderId.value === props.id ? 'border-indigo-400 ring-2 ring-indigo-300 shadow-md' : cfg.border,
      isDimmed ? 'opacity-40' : '',
    ]"
    @click="canvas.openOverlay(props.id, data.stepId, data.stepType)"
  >
    <div :class="['p-4', data.sources.length > 0 ? 'border-b border-gray-100' : '']">
      <div class="flex items-center justify-between mb-1">
        <span :class="['text-xs font-medium uppercase tracking-wide', cfg.tag]">{{ cfg.icon }} Vstupní data</span>
        <span :class="['text-xs px-2 py-0.5 rounded-full font-medium', cfg.badge]">{{ data.addMethod === 'GLOBAL_DB' ? data.selected : data.total }} {{ unit }}</span>
      </div>
      <h3 class="text-sm font-semibold text-gray-800">{{ data.label }}</h3>
    </div>
    <div v-if="data.sources.length > 0" class="px-3 py-2 space-y-1">
      <button
        v-for="src in data.sources"
        :key="src.id"
        :class="['w-full flex items-center gap-2 text-xs rounded-lg px-2 py-1 transition-colors text-left', isSourceExpanded(src.id) ? `${cfg.expanded} font-medium` : `text-gray-500 ${cfg.hover}`]"
        @click="onSourceClick($event, src.id)"
      >
        <span :class="['w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot]"></span>
        <span class="truncate">{{ src.label }}</span>
      </button>
    </div>
  </div>
  <Handle type="source" :position="Position.Right" class="!bg-indigo-400" />
</template>
