<script setup lang="ts">
import { useOverlay, overlayKey } from '~/composables/canvas/useOverlay'

const overlay = useOverlay()
provide(overlayKey, overlay)
const {
  canvas, isOpen, activeNode, activeEdgeId, activeTab, tabItems, overlayTitle, modelBadge, stepType,
  showStickyTabs, stickyTabItems, activeStickyCategory, selectStickyCategory, switchMainTab,
} = overlay



</script>

<template>
  <Transition name="overlay">
    <div v-if="isOpen && stepType !== 'OUTREACH_PREPARATION'" class="fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col overflow-visible" style="width: 620px">
      <div v-if="showStickyTabs && activeNode && !activeEdgeId" class="sticky-tabs">
        <button
          v-for="tab in stickyTabItems"
          :key="tab.key"
          type="button"
          :title="tab.label"
          :class="['sticky-tab', `sticky-tab--${tab.style}`, activeStickyCategory === tab.key && 'sticky-tab--active']"
          @click="selectStickyCategory(tab.key)"
        >{{ tab.icon }} {{ tab.label }}</button>
      </div>
      <div class="relative z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-white">
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
      <div v-if="activeNode && !activeEdgeId" class="relative z-10 flex items-end border-b border-gray-100 flex-shrink-0 bg-white">
        <div class="flex flex-1 min-w-0">
          <button
            v-for="tab in tabItems"
            :key="tab.key"
            type="button"
            :class="['px-5 py-2.5 text-xs font-medium border-b-2 transition-colors bg-white', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="switchMainTab(tab.key)"
          >{{ tab.label }}</button>
        </div>
      </div>
      <div class="relative z-10 flex-1 overflow-y-auto min-h-0 bg-white">
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

.sticky-tabs {
  @apply absolute left-0 flex flex-col items-stretch gap-1.5 z-0 pointer-events-none;
  top: 5rem;
  transform: translateX(calc(-100% + 14px));
}

.sticky-tab {
  @apply text-[10px] leading-tight font-medium pl-2 pr-4 py-1.5 rounded-l-lg border border-r-0 shadow-md transition-all whitespace-nowrap pointer-events-auto;
  transform: rotate(-2deg);
  transform-origin: right center;
}
.sticky-tab--run {
  @apply bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100;
  transform: rotate(-1deg);
}
.sticky-tab--import {
  @apply bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100;
}
.sticky-tab--db {
  @apply bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100;
  transform: rotate(1.5deg);
}
.sticky-tab--active {
  @apply shadow-lg font-semibold;
  transform: rotate(0deg) translateX(-4px);
}
.sticky-tab--run.sticky-tab--active { @apply bg-blue-100 border-blue-500; }
.sticky-tab--import.sticky-tab--active { @apply bg-emerald-100 border-emerald-500; }
.sticky-tab--db.sticky-tab--active { @apply bg-rose-100 border-rose-500; }
</style>
