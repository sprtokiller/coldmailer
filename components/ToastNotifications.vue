<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      name="toast"
      tag="div"
      class="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto rounded-xl shadow-xl border px-4 py-3 flex items-center gap-2 text-sm min-w-[280px] max-w-[420px]"
        :class="{
          'bg-green-50 border-green-200 text-green-800': t.type === 'success',
          'bg-red-50 border-red-200 text-red-800': t.type === 'error',
          'bg-white border-gray-200 text-gray-800': t.type === 'info',
        }"
      >
        <svg v-if="t.type === 'success'" class="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
        <svg v-else-if="t.type === 'error'" class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <svg v-else class="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span class="select-none">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateY(-12px); }
.toast-leave-to { opacity: 0; transform: translateY(-8px) scale(0.95); }
.toast-move { transition: transform 0.25s ease; }
</style>
