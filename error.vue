<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; statusMessage?: string } }>()
const { loggedIn } = useUserSession()

const is404 = computed(() => props.error.statusCode === 404)

function handleBack() {
  clearError({ redirect: loggedIn.value ? '/' : '/login' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center font-sans px-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-md text-center">

      <div
        class="w-14 h-14 rounded-xl mx-auto mb-6 flex items-center justify-center"
        :class="is404 ? 'bg-gray-200' : 'bg-red-100'"
      >
        <svg v-if="is404" class="w-7 h-7 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <svg v-else class="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>

      <template v-if="is404">
        <h1 class="text-4xl font-bold text-gray-800 mb-2">404</h1>
        <p class="text-sm text-gray-500 mb-8">
          Tady nic není. Pokud tady něco má být, napiš Víťovi.
        </p>
      </template>

      <template v-else>
        <h1 class="text-2xl font-semibold text-gray-800 mb-2">A jéje, Víťa asi něco nedomyslel.</h1>
        <p class="text-sm text-gray-400 mb-2">Chyba {{ error.statusCode }}</p>
        <p v-if="error.statusMessage" class="text-xs text-gray-400 mb-8">{{ error.statusMessage }}</p>
        <div v-else class="mb-8" />
      </template>

      <button
        class="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 active:opacity-80 transition-opacity w-full"
        @click="handleBack"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {{ loggedIn ? 'Na hlavní stránku' : 'Na přihlášení' }}
      </button>
    </div>
  </div>
</template>
