<script setup lang="ts">
const { notifications, cancel, remove } = useSendNotifications()

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${s}s`
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      name="notif"
      tag="div"
      class="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
    >
      <div
        v-for="n in notifications"
        :key="n.id"
        class="pointer-events-auto rounded-xl shadow-xl border px-4 py-3 flex items-center gap-3 text-sm min-w-[340px] max-w-[480px]"
        :class="{
          'bg-white border-gray-200 text-gray-800': n.status === 'pending',
          'bg-green-50 border-green-200 text-green-800': n.status === 'sent',
          'bg-red-50 border-red-200 text-red-800': n.status === 'error',
        }"
      >
        <!-- Pending -->
        <template v-if="n.status === 'pending'">
          <div class="relative w-5 h-5 shrink-0">
            <svg class="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-200" />
              <circle
                cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"
                class="text-primary transition-[stroke-dashoffset] duration-100"
                :stroke-dasharray="50.265"
                :stroke-dashoffset="50.265 * (1 - n.countdownMs / n.gracePeriodMs)"
                stroke-linecap="round"
              />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-500">
              {{ formatCountdown(n.countdownMs) }}
            </span>
          </div>
          <span class="truncate"><span class="font-medium">{{ n.partnerName }}</span> — e-mail bude odeslán za {{ formatCountdown(n.countdownMs) }}</span>
          <button
            class="ml-auto text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 transition-colors shrink-0"
            @click="cancel(n.id)"
          >
            Zrušit
          </button>
        </template>

        <!-- Sent -->
        <template v-else-if="n.status === 'sent'">
          <svg class="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span><span class="font-medium">{{ n.partnerName }}</span> — odesláno</span>
        </template>

        <!-- Error -->
        <template v-else-if="n.status === 'error'">
          <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="truncate"><span class="font-medium">{{ n.partnerName }}</span> — {{ n.errorMessage }}</span>
          <button class="ml-auto text-xs font-medium underline shrink-0" @click="remove(n.id)">Zavřít</button>
        </template>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.notif-enter-active, .notif-leave-active { transition: all 0.25s ease; }
.notif-enter-from { opacity: 0; transform: translateY(-12px); }
.notif-leave-to { opacity: 0; transform: translateY(-8px) scale(0.95); }
.notif-move { transition: transform 0.25s ease; }
</style>
