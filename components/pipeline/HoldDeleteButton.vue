<script setup lang="ts">
const emit = defineEmits<{ delete: [] }>()
const progress = ref(0)
let rafId: number | null = null
let startTime: number | null = null
let completed = false
const C = 2 * Math.PI * 8

function onMousedown(e: MouseEvent) {
  e.preventDefault()
  completed = false
  startTime = Date.now()
  progress.value = 0
  tick()
}

function tick() {
  if (startTime === null) return
  const p = Math.min(100, ((Date.now() - startTime) / 1000) * 100)
  progress.value = p
  if (p < 100) {
    rafId = requestAnimationFrame(tick)
  } else {
    completed = true
    rafId = null
  }
}

function onMouseup() {
  const ok = completed
  cancel()
  if (ok) emit('delete')
}

function cancel() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  startTime = null
  progress.value = 0
  completed = false
}
</script>

<template>
  <button
    type="button"
    class="relative w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors select-none cursor-pointer"
    title="Podržte pro smazání"
    @mousedown.prevent="onMousedown"
    @mouseup="onMouseup"
    @mouseleave="cancel"
    @contextmenu.prevent
  >
    <svg
      v-if="progress > 0"
      class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <circle
        cx="10" cy="10" r="8"
        fill="none"
        stroke="rgb(239 68 68)"
        stroke-width="2"
        stroke-linecap="round"
        :stroke-dasharray="C"
        :stroke-dashoffset="C * (1 - progress / 100)"
      />
    </svg>
    <svg class="relative z-10 w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  </button>
</template>
