<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { isLegacyRef, sourceConfig, LEVEL_LABELS, COMP_STATUS_COLORS, COMP_STATUS_LABELS } from '~/composables/canvas/useOverlayCore'
const o = inject(overlayKey)!
const { stepType, canvas, currentRunId, sourcePanels, expandedSources, toggleExpand, panelRecords, msPayload,
  confirmingDeleteSource, deleteSourceLoading, deleteSource, canRehydrate, rehydrateConfiguration,
  toggleSel, deleteRecord, deleteUnselected, selectAllInSource,
  editingRefId, editSaving, editName, editUrl, editDescription, editIndustry,
  editType, editLevel, editTargetGroup, editOrganizer, editFrequency, editCompStatus,
  MS_LEVEL_OPTIONS, MS_FREQ_OPTIONS, MS_STATUS_OPTIONS,
  startEdit, cancelEdit, saveEdit, recordProvenance } = o
</script>

<template>
  <CanvasEmptyState v-if="sourcePanels.length === 0" message="Žádná data. Přidejte zdroj pomocí tlačítek výše." />
  <div v-else>
    <div
      v-for="panel in sourcePanels" :key="panel.key"
      :class="['border-b border-gray-100 last:border-b-0', canvas.activeSourceFilter.value === panel.key ? 'ring-1 ring-inset ring-indigo-200 bg-indigo-50/30' : '']"
    >
      <!-- Panel header -->
      <div class="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
        <button class="flex items-center gap-3 flex-1 min-w-0 text-left" @click="toggleExpand(panel.key)">
          <span :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', sourceConfig(panel.source?.type).cls]">{{ sourceConfig(panel.source?.type).label }}</span>
          <span class="flex-1 text-sm text-gray-700 truncate">{{ panel.source?.label ?? 'Legacy data' }}</span>
        </button>
        <NuxtLink v-if="panel.source?.pipelineRunId && panel.source.pipelineRunId !== currentRunId" :to="`/pipeline/${panel.source.pipelineRunId}`" class="text-xs text-indigo-500 hover:text-indigo-700 underline flex-shrink-0" @click.stop>↗ Zobrazit</NuxtLink>
        <span class="text-xs text-gray-300 flex-shrink-0">{{ panel.records.length }} celkem</span>
        <button
          v-if="canRehydrate(panel.source)"
          class="p-1 text-gray-300 hover:text-indigo-500 transition-colors flex-shrink-0"
          title="Znovu použít konfiguraci"
          @click.stop="rehydrateConfiguration(panel.source)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
        <button
          v-if="panel.source?.id"
          class="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
          title="Smazat zdroj"
          @click.stop="confirmingDeleteSource = panel.source!.id"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button class="flex-shrink-0" @click="toggleExpand(panel.key)">
          <svg class="w-4 h-4 text-gray-300 transition-transform duration-150" :class="expandedSources.has(panel.key) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <!-- Delete confirmation -->
      <div v-if="panel.source?.id && confirmingDeleteSource === panel.source.id" class="px-5 py-4 border-t border-red-100 bg-red-50/40">
        <p class="text-sm font-medium text-gray-800 mb-1">Chystáte se odstranit zdroj dat.</p>
        <p class="text-xs text-gray-500 mb-3">Co se má stát s nalezenými výsledky?</p>
        <div class="flex flex-col gap-2">
          <button
            :disabled="deleteSourceLoading"
            class="text-xs px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors text-left"
            @click="deleteSource(panel.source!.id, 'move_to_db')"
          >
            <span class="font-medium">Přesunout do DB</span>
            <span class="block text-indigo-500 mt-0.5">Záznamy zůstanou v globální databázi, ale budou odebrány z tohoto kroku.</span>
          </button>
          <button
            :disabled="deleteSourceLoading"
            class="text-xs px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors text-left"
            @click="deleteSource(panel.source!.id, 'delete_new')"
          >
            <span class="font-medium">Smazat nové</span>
            <span class="block text-red-500 mt-0.5">Vymaže záznamy přidané pouze tímto zdrojem. Záznamy existující i jinde zůstanou.</span>
          </button>
          <button
            :disabled="deleteSourceLoading"
            class="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            @click="confirmingDeleteSource = null"
          >Zrušit</button>
        </div>
      </div>

      <!-- Expanded content -->
      <div v-else-if="expandedSources.has(panel.key)">
        <div v-if="panel.key !== 'legacy' && (stepType !== 'MARKET_SCANNING' || panel.source?.type === 'GLOBAL_DB_SELECT')" class="px-5 py-1.5 flex items-center gap-3 bg-gray-50/70 border-t border-gray-100">
          <button class="text-xs text-indigo-600 hover:underline" @click="selectAllInSource(panel.key, true)">Vybrat vše</button>
          <span class="text-gray-300">|</span>
          <button class="text-xs text-gray-500 hover:underline" @click="selectAllInSource(panel.key, false)">Zrušit výběr</button>
          <template v-if="panel.records.some(r => !r.isSelectedForProcessing && !isLegacyRef(r))">
            <span class="text-gray-200">|</span>
            <button v-if="stepType !== 'MARKET_SCANNING' || panel.source?.type === 'GLOBAL_DB_SELECT'" class="text-xs text-red-500 hover:underline" @click="deleteUnselected(panel.key)">Odebrat odznačené</button>
          </template>
        </div>
        <div class="divide-y divide-gray-50 border-t border-gray-100">
          <template v-for="rec in panelRecords(panel)" :key="rec.id">
            <!-- Normal row -->
            <div v-if="editingRefId !== rec.id" class="px-5 py-2.5 hover:bg-gray-50 transition-colors">
              <div class="flex items-start gap-3">
                <input v-if="stepType !== 'MARKET_SCANNING' || panel.source?.type === 'GLOBAL_DB_SELECT'" type="checkbox" :checked="rec.isSelectedForProcessing" :disabled="isLegacyRef(rec)" class="mt-0.5 rounded disabled:opacity-40 flex-shrink-0" @change="toggleSel(rec.id, ($event.target as HTMLInputElement).checked)" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium text-gray-800 truncate">{{ rec.globalRecord.canonicalName }}</span>
                    <span v-if="isLegacyRef(rec)" class="text-xs text-gray-300 flex-shrink-0">legacy</span>
                  </div>
                  <template v-if="stepType === 'MARKET_SCANNING'">
                    <div class="flex flex-wrap gap-1 mb-1">
                      <span v-if="msPayload(rec).type" class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{{ msPayload(rec).type }}</span>
                      <span v-if="msPayload(rec).level" class="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{{ LEVEL_LABELS[msPayload(rec).level] ?? msPayload(rec).level }}</span>
                      <span v-if="msPayload(rec).target_group" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ msPayload(rec).target_group }}</span>
                      <span v-if="msPayload(rec).status" :class="['text-xs px-1.5 py-0.5 rounded', COMP_STATUS_COLORS[msPayload(rec).status] ?? 'bg-gray-50 text-gray-400']">{{ COMP_STATUS_LABELS[msPayload(rec).status] ?? msPayload(rec).status }}</span>
                    </div>
                    <p v-if="msPayload(rec).description" class="text-xs text-gray-500 mb-1 line-clamp-2">{{ msPayload(rec).description }}</p>
                    <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      <span v-if="msPayload(rec).organizer">{{ msPayload(rec).organizer }}</span>
                      <span v-if="msPayload(rec).frequency">{{ msPayload(rec).frequency === 'unknown' ? 'frekvence neznámá' : msPayload(rec).frequency }}</span>
                      <a v-if="msPayload(rec).url" :href="msPayload(rec).url" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
                    </div>
                    <p v-if="recordProvenance(rec)" class="text-xs text-gray-400 mt-1">{{ recordProvenance(rec) }}</p>
                  </template>
                </div>
                <div v-if="!isLegacyRef(rec)" class="flex gap-1 flex-shrink-0">
                  <button class="p-1 text-gray-300 hover:text-gray-500 transition-colors" title="Upravit" @click="startEdit(rec)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button v-if="stepType !== 'MARKET_SCANNING' || rec.addMethod === 'GLOBAL_DB'" class="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Odebrat" @click="deleteRecord(rec)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
            <!-- Edit row -->
            <div v-else class="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div class="space-y-1.5">
                <input v-model="editName" type="text" placeholder="Název *" class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white font-medium" @keyup.escape="cancelEdit()" />
                <template v-if="stepType === 'MARKET_SCANNING'">
                  <div class="grid grid-cols-2 gap-1.5">
                    <input v-model="editType" type="text" placeholder="Typ (programming, hackathon…)" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                    <select v-model="editLevel" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"><option value="">Úroveň</option><option v-for="opt in MS_LEVEL_OPTIONS" :key="opt" :value="opt">{{ LEVEL_LABELS[opt] ?? opt }}</option></select>
                    <input v-model="editTargetGroup" type="text" placeholder="Cílová skupina (SŠ, VŠ…)" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                    <input v-model="editOrganizer" type="text" placeholder="Pořadatel" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                    <select v-model="editFrequency" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"><option value="">Frekvence</option><option v-for="opt in MS_FREQ_OPTIONS" :key="opt" :value="opt">{{ opt === 'unknown' ? 'frekvence neznámá' : opt }}</option></select>
                    <select v-model="editCompStatus" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"><option value="">Stav</option><option v-for="opt in MS_STATUS_OPTIONS" :key="opt" :value="opt">{{ COMP_STATUS_LABELS[opt] ?? opt }}</option></select>
                  </div>
                  <textarea v-model="editDescription" rows="2" placeholder="Popis (1–2 věty)" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white resize-none" />
                </template>
                <template v-else-if="stepType === 'PARTNER_IDENTIFICATION'">
                  <textarea v-model="editDescription" rows="2" placeholder="Popis partnera" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white resize-none" />
                  <input v-model="editIndustry" type="text" placeholder="Odvětví / Typ" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                </template>
                <input v-model="editUrl" type="text" placeholder="URL" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" @keyup.escape="cancelEdit()" />
                <div class="flex gap-2 pt-0.5">
                  <button :disabled="editSaving || !editName.trim()" class="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors" @click="saveEdit(rec)">{{ editSaving ? '...' : 'Uložit' }}</button>
                  <button class="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" @click="cancelEdit()">Zrušit</button>
                </div>
              </div>
            </div>
          </template>
          <div v-if="panelRecords(panel).length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">Žádné záznamy pro aktuální filtr</div>
        </div>
      </div>
    </div>
  </div>
</template>
