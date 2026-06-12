<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
const o = inject(overlayKey)!
const { stepType, stepId, stepRecordType, allRecords, isOutputStep, recordsLoading,
  activeAddPanel, activeTab, searchFilter,
  manualName, manualUrl, manualLoading, manualError, doManual } = o
</script>

<template>
  <!-- Toolbar -->
  <div v-if="stepType !== 'MARKET_SCANNING'" class="px-5 py-3 border-b border-gray-100 flex gap-2 flex-wrap flex-shrink-0">
    <template v-if="!isOutputStep">
      <button :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === null ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']" @click="activeAddPanel = null">Přehled</button>
      <button class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors" @click="activeTab = 'config'">▶ Spustit</button>
      <button :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'import' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']" @click="activeAddPanel = 'import'">↑ Importovat</button>
      <button :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'db' ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']" @click="activeAddPanel = 'db'">🔍 Z databáze</button>
      <button v-if="!['MARKET_SCANNING', 'PARTNER_IDENTIFICATION'].includes(stepType ?? '')" :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'manual' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']" @click="activeAddPanel = 'manual'">+ Ručně</button>
    </template>
    <button v-else class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors" @click="activeTab = 'input'">▶ Spustit</button>
  </div>

  <!-- Import panel -->
  <CanvasImportPanel v-if="activeAddPanel === 'import'" class="border-b border-gray-100" :step-id="stepId" :step-type="stepType" @close="activeAddPanel = null" />

  <!-- DB panel -->
  <CanvasDbPanel v-if="activeAddPanel === 'db'" class="border-b border-gray-100" :step-id="stepId" :step-record-type="stepRecordType" :all-records="allRecords" @close="activeAddPanel = null" />

  <!-- Manual add panel -->
  <div v-if="activeAddPanel === 'manual'" class="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
    <div class="space-y-2">
      <input v-model="manualName" type="text" placeholder="Název záznamu *" class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
      <input v-model="manualUrl" type="text" placeholder="URL (volitelné)" class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
    </div>
    <p v-if="manualError" class="text-xs text-red-500 mt-1.5">{{ manualError }}</p>
    <div class="flex gap-2 mt-3">
      <button :disabled="manualLoading || !manualName.trim() || !stepId" class="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" @click="doManual()">{{ manualLoading ? 'Přidávám...' : 'Přidat' }}</button>
      <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="activeAddPanel = null">Zrušit</button>
    </div>
    <p v-if="!stepId" class="text-xs text-amber-600 mt-1.5">Krok musí být nejprve spuštěn.</p>
  </div>

  <!-- Steps 3-6: outputData cards -->
  <template v-if="isOutputStep">
    <CanvasStepDetailOutputCards />
  </template>

  <!-- Steps 1-2: GlobalRecord-based -->
  <template v-else-if="activeAddPanel === null">
    <!-- Filter bar -->
    <div class="px-5 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
      <input v-model="searchFilter" type="text" placeholder="Hledat záznamy..." class="flex-1 min-w-32 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
    </div>
    <!-- Loading -->
    <div v-if="recordsLoading" class="flex items-center justify-center h-32 text-gray-400 text-sm">Načítám...</div>
    <!-- PI: flat partner list -->
    <CanvasStepDetailResultPi v-else-if="stepType === 'PARTNER_IDENTIFICATION'" />
    <!-- MS: source panels -->
    <CanvasStepDetailResultMs v-else />
  </template>
</template>
