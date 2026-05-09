<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: credits, pending, error, refresh } = await useFetch('/api/settings/credits')

const usedPct = computed(() => {
  if (!credits.value || credits.value.totalCredits <= 0) return 0
  return Math.min(100, (credits.value.usedCredits / credits.value.totalCredits) * 100)
})

const remainingPct = computed(() => 100 - usedPct.value)

const barColor = computed(() => {
  if (remainingPct.value > 40) return 'bg-success'
  if (remainingPct.value > 15) return 'bg-amber-400'
  return 'bg-danger'
})

const textColor = computed(() => {
  if (remainingPct.value > 40) return 'text-success'
  if (remainingPct.value > 15) return 'text-amber-500'
  return 'text-danger'
})

function fmt(n: number) {
  return n.toFixed(4)
}
</script>

<template>
  <div>
    <div class="flex items-start justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Nastavení</h1>
        <p class="text-sm text-gray-400 mt-1">Přehled účtu a konfigurace integrace.</p>
      </div>

      <!-- Credits widget -->
      <div class="w-72 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 shrink-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">OpenRouter kredity</span>
          <button
            class="text-gray-300 hover:text-gray-500 transition-colors"
            :class="{ 'animate-spin': pending }"
            title="Obnovit"
            @click="refresh()"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div v-if="pending" class="py-6 flex items-center justify-center text-gray-300">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <div v-else-if="error" class="py-4 text-center">
          <p class="text-xs text-danger">{{ error.message }}</p>
          <p class="text-xs text-gray-400 mt-1">Zkontrolujte <code class="bg-gray-50 px-1 rounded">OPEN_ROUTER_MANAGEMENT_KEY</code></p>
        </div>

        <template v-else-if="credits">
          <div class="mt-3 mb-4">
            <span class="text-3xl font-bold" :class="textColor">${{ fmt(credits.remainingCredits) }}</span>
            <span class="text-sm text-gray-400 ml-1">zbývá</span>
          </div>

          <!-- Progress bar -->
          <div class="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <div
              class="h-2 rounded-full transition-all duration-700"
              :class="barColor"
              :style="`width: ${remainingPct}%`"
            />
          </div>

          <div class="flex justify-between text-xs text-gray-400">
            <span>Celkem ${{ fmt(credits.totalCredits) }}</span>
            <span>Využito ${{ fmt(credits.usedCredits) }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
