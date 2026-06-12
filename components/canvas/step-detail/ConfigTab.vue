<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
const o = inject(overlayKey)!
const { stepType, matchedStep, stepIdx, stepRecordType, stepId, allRecords,
  msRecords, msTotalSelected, activeTab, configSubSection, importPrefillText } = o
</script>

<template>
  <!-- MS + PI + PP: sub-section nav (run / import / db) -->
  <template v-if="stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_IDENTIFICATION' || stepType === 'PARTNER_PROFILING'">
    <div class="px-5 py-3 border-b border-gray-100 flex gap-2 flex-shrink-0">
      <button
        :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'run' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
        @click="configSubSection = 'run'"
      >▶ Spustit AI</button>
      <button
        :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'import' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
        @click="configSubSection = 'import'"
      >↑ Importovat</button>
      <button
        v-if="stepType !== 'PARTNER_PROFILING'"
        :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'db' ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
        @click="configSubSection = 'db'"
      >🔍 Z databáze</button>
    </div>
    <div v-if="configSubSection === 'run'" class="px-5 py-4">
      <div
        v-if="stepType === 'PARTNER_IDENTIFICATION' && msRecords.length > 0"
        class="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700"
      >
        <span>Zpracuje <strong>{{ msTotalSelected }}</strong> z {{ msRecords.length }} zdrojů z&nbsp;Kroku&nbsp;1.</span>
        <button class="ml-auto underline text-indigo-500 hover:text-indigo-700 whitespace-nowrap" @click="activeTab = 'input'">Upravit výběr →</button>
      </div>
      <div v-if="matchedStep" class="min-w-0">
        <PipelineStepConfig :step="matchedStep" :idx="stepIdx" />
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-12">Tento krok ještě nebyl spuštěn.</div>
    </div>
    <CanvasImportPanel
      v-else-if="configSubSection === 'import'"
      :step-id="stepId" :step-type="stepType" :prefill="importPrefillText"
      @close="configSubSection = 'run'"
      @consumed="importPrefillText = ''"
    />
    <CanvasDbPanel
      v-else-if="configSubSection === 'db'"
      :step-id="stepId" :step-record-type="stepRecordType" :all-records="allRecords"
      @close="configSubSection = 'run'"
    />
  </template>

  <!-- Other steps: standard config -->
  <template v-else>
    <div class="p-5">
      <div v-if="matchedStep" class="min-w-0">
        <PipelineStepConfig :step="matchedStep" :idx="stepIdx" />
      </div>
      <div v-else class="text-sm text-gray-400 text-center py-12">Tento krok ještě nebyl spuštěn.</div>
    </div>
  </template>
</template>
