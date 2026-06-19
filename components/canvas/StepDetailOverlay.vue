<script setup lang="ts">
import { useOverlay, overlayKey } from '~/composables/canvas/useOverlay'

const overlay = useOverlay()
provide(overlayKey, overlay)
const { canvas, isOpen, activeNode, activeEdgeId, activeTab, tabItems, overlayTitle, modelBadge, stepType } = overlay



</script>

<template>
  <Transition name="overlay">
    <div v-if="isOpen && stepType !== 'OUTREACH_PREPARATION'" class="fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col" style="width: 620px">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <h2 class="text-sm font-semibold text-gray-800 truncate">{{ overlayTitle }}</h2>
          <span v-if="modelBadge" :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', modelBadge.cls]">{{ modelBadge.label }}</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600 transition-colors ml-4 flex-shrink-0" @click="canvas.closeOverlay()">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div v-if="activeNode && !activeEdgeId" class="flex border-b border-gray-100 flex-shrink-0">
        <button
          v-for="tab in tabItems"
          :key="tab.key"
          :class="['px-5 py-2.5 text-xs font-medium border-b-2 transition-colors', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        <CanvasStepDetailEdgeDetail v-if="activeEdgeId" />
        <CanvasStepDetailInputTabPi v-else-if="activeTab === 'input' && stepType === 'PARTNER_IDENTIFICATION'" />
        <CanvasStepDetailInputTab v-else-if="activeTab === 'input'" />
        <CanvasStepDetailConfigTab v-else-if="activeTab === 'config'" />
        <CanvasStepDetailResultTab v-else-if="activeTab === 'result'" />
      </div>
    </div>
  </Transition>
</template>


<style scoped>
.overlay-enter-active, .overlay-leave-active { transition: transform 0.2s ease; }
.overlay-enter-from, .overlay-leave-to { transform: translateX(100%); }
</style>
