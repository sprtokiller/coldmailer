<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { isLegacyRef } from '~/composables/canvas/useOverlayCore'
const o = inject(overlayKey)!
const { allRecords, piResultRecords, piRunFilter, piCurrentRunCount,
  piPartnerSources, piPipelineCount, piPayload, recordProvenance,
  expandedPiPartners, togglePiPartner, toggleSel, startEdit, deleteRecord } = o
</script>

<template>
  <div class="px-5 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
    <span class="text-xs text-gray-400 flex-1">{{ piResultRecords.length }} / {{ allRecords.length }} partnerů</span>
    <div class="flex gap-1">
      <button
        :class="['text-xs px-2.5 py-1 rounded-lg border transition-colors', piRunFilter === 'all' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
        @click="piRunFilter = 'all'"
      >Vše ({{ allRecords.length }})</button>
      <button
        :class="['text-xs px-2.5 py-1 rounded-lg border transition-colors', piRunFilter === 'current' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
        @click="piRunFilter = 'current'"
      >Tento běh ({{ piCurrentRunCount }})</button>
    </div>
  </div>
  <CanvasEmptyState v-if="piResultRecords.length === 0" message="Žádní partneři pro aktuální filtr." />
  <div v-else class="divide-y divide-gray-50">
    <div v-for="rec in piResultRecords" :key="rec.id" class="px-5 py-2.5 hover:bg-gray-50 transition-colors">
      <div class="flex items-start gap-3">
        <input
          type="checkbox"
          :checked="rec.isSelectedForProcessing"
          :disabled="isLegacyRef(rec)"
          class="mt-0.5 rounded disabled:opacity-40 flex-shrink-0"
          @change="toggleSel(rec.id, ($event.target as HTMLInputElement).checked)"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span class="text-sm font-medium text-gray-800 truncate">{{ rec.globalRecord.canonicalName }}</span>
            <span v-if="piPayload(rec).industry || piPayload(rec).type" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ piPayload(rec).industry || piPayload(rec).type }}</span>
            <a v-if="piPayload(rec).website || piPayload(rec).url" :href="piPayload(rec).website || piPayload(rec).url" target="_blank" rel="noopener" class="text-xs text-indigo-400 hover:text-indigo-600 flex-shrink-0" @click.stop>↗</a>
            <span v-if="piPartnerSources(rec.globalRecord.canonicalName).length > 0" class="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">{{ piPartnerSources(rec.globalRecord.canonicalName).length }}× nalezen</span>
            <span v-if="piPipelineCount(rec) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ piPipelineCount(rec) }}× pipeline</span>
          </div>
          <p v-if="!expandedPiPartners.has(rec.id) && piPayload(rec).description" class="text-xs text-gray-500 line-clamp-1">{{ piPayload(rec).description }}</p>
          <template v-if="expandedPiPartners.has(rec.id)">
            <p v-if="piPayload(rec).description" class="text-xs text-gray-500 mt-0.5">{{ piPayload(rec).description }}</p>
            <div v-if="piPartnerSources(rec.globalRecord.canonicalName).length > 0" class="mt-1.5">
              <span class="text-xs text-gray-400 mb-0.5 block">Nalezen v:</span>
              <div class="flex flex-wrap gap-1">
                <span v-for="src in piPartnerSources(rec.globalRecord.canonicalName)" :key="src" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{{ src }}</span>
              </div>
            </div>
            <p v-if="recordProvenance(rec)" class="text-xs text-gray-400 mt-1">{{ recordProvenance(rec) }}</p>
          </template>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button
            v-if="piPartnerSources(rec.globalRecord.canonicalName).length > 0 || piPayload(rec).description"
            class="p-1 text-xs text-gray-300 hover:text-gray-500 transition-colors"
            @click="togglePiPartner(rec.id)"
          >{{ expandedPiPartners.has(rec.id) ? '▲' : '▼' }}</button>
          <button v-if="!isLegacyRef(rec)" class="p-1 text-gray-300 hover:text-gray-500 transition-colors" title="Upravit" @click="startEdit(rec)">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button v-if="!isLegacyRef(rec)" class="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Odebrat" @click="deleteRecord(rec)">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
