<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { sourceConfig, isLegacyRef } from '~/composables/canvas/useOverlayCore'
const o = inject(overlayKey)!
const { msSourceGroups, msExpandedGroups, msRecords, msRecordsLoading, msTotalSelected, currentRunId,
  piProcessedItemNames, toggleMsGroup, selectAllInGroup, toggleMsSel } = o
</script>

<template>
  <div v-if="msRecordsLoading" class="flex items-center justify-center h-32 text-gray-400 text-sm">Načítám...</div>
  <CanvasEmptyState v-else-if="msSourceGroups.length === 0" message="Krok 1 zatím nemá žádné záznamy." />
  <div v-else>
    <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between">
      <span class="text-xs text-gray-500">
        <span class="font-semibold text-gray-800">{{ msTotalSelected }}</span> z {{ msRecords.length }} vybráno pro zpracování
      </span>
    </div>
    <div v-for="group in msSourceGroups" :key="group.key" class="border-b border-gray-100 last:border-b-0">
      <button
        class="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
        @click="toggleMsGroup(group.key)"
      >
        <span :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', sourceConfig(group.source?.type).cls]">
          {{ sourceConfig(group.source?.type).label }}
        </span>
        <span class="flex-1 text-sm text-gray-700 truncate">{{ group.source?.label ?? 'Legacy data' }}</span>
        <NuxtLink
          v-if="group.source?.pipelineRunId && group.source.pipelineRunId !== currentRunId"
          :to="`/pipeline/${group.source.pipelineRunId}`"
          class="text-xs text-indigo-500 hover:text-indigo-700 underline flex-shrink-0"
          @click.stop
        >↗ Zobrazit</NuxtLink>
        <span class="text-xs text-gray-400 flex-shrink-0">{{ group.selectedCount }}/{{ group.records.length }}</span>
        <svg class="w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-150"
          :class="msExpandedGroups.has(group.key) ? 'rotate-180' : ''"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div v-if="msExpandedGroups.has(group.key)">
        <div class="px-5 py-1.5 flex items-center gap-3 bg-gray-50/70 border-t border-gray-100">
          <button class="text-xs text-indigo-600 hover:underline" @click="selectAllInGroup(group, true)">Vybrat vše</button>
          <span class="text-gray-300">|</span>
          <button class="text-xs text-gray-500 hover:underline" @click="selectAllInGroup(group, false)">Zrušit výběr</button>
        </div>
        <div class="divide-y divide-gray-50 border-t border-gray-100">
          <div
            v-for="rec in group.records" :key="rec.id"
            class="px-5 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          >
            <input
              type="checkbox" :checked="rec.isSelectedForProcessing" :disabled="isLegacyRef(rec)"
              class="rounded disabled:opacity-40 flex-shrink-0"
              @change="toggleMsSel(rec.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1 text-sm text-gray-800 truncate">{{ rec.globalRecord.canonicalName }}</span>
            <span
              v-if="piProcessedItemNames.has(rec.globalRecord.canonicalName.toLowerCase().trim())"
              class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium flex-shrink-0"
            >✓ Zpracováno</span>
            <a
              v-if="(rec.globalRecord.payload as Record<string,string>).url"
              :href="(rec.globalRecord.payload as Record<string,string>).url"
              target="_blank" rel="noopener"
              class="text-xs text-indigo-400 hover:text-indigo-600 flex-shrink-0" @click.stop
            >↗</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
