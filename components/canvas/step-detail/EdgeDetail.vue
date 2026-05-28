<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
const o = inject(overlayKey)!
const { edgeDetail, edgeChartData } = o
</script>

<template>
  <div v-if="edgeDetail" class="p-6 flex flex-col items-center gap-6">
    <p class="text-xs text-gray-400 self-start">
      Složení vstupu z <strong class="text-gray-600">{{ edgeDetail.sourceNode?.data.label }}</strong>
    </p>
    <div v-if="!edgeChartData" class="text-sm text-gray-400 py-8">Žádné záznamy</div>
    <template v-else>
      <div class="relative flex-shrink-0">
        <svg viewBox="0 0 100 100" class="w-44 h-44 -rotate-90">
          <circle cx="50" cy="50" r="36" fill="none" stroke="#f3f4f6" stroke-width="20" />
          <circle
            v-for="seg in edgeChartData.segments"
            :key="seg.key"
            cx="50" cy="50" r="36" fill="none"
            :stroke="seg.color" stroke-width="20"
            :stroke-dasharray="`${seg.dash} ${seg.gap}`"
            :stroke-dashoffset="seg.offset"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-2xl font-bold text-gray-800">{{ edgeChartData.totalSelected }}</span>
          <span class="text-xs text-gray-400">z {{ edgeChartData.total }}</span>
        </div>
      </div>
      <div class="w-full space-y-2">
        <div v-for="seg in edgeChartData.segments" :key="seg.key" class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-sm flex-shrink-0" :style="{ backgroundColor: seg.color }" />
          <span class="text-xs text-gray-700 flex-1 truncate">{{ seg.label }}</span>
          <span class="text-xs font-medium text-gray-500">{{ seg.count }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
