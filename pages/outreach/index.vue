<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'pipeline' })

const { data: runs, pending } = await useFetch('/api/pipeline', { default: () => [] })

// Auto-redirect to first run
watch(runs, (val) => {
  if (val.length > 0) {
    navigateTo(`/outreach/${val[0].id}`, { replace: true })
  }
}, { immediate: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 pt-8">
    <div v-if="pending" class="flex items-center justify-center py-20 text-gray-400 text-sm">
      Načítám...
    </div>

    <div v-else-if="runs.length === 0" class="flex flex-col items-center justify-center py-20 text-center gap-3">
      <svg class="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p class="text-gray-500 text-sm">Žádné pipeline runy pro tento projekt.</p>
      <NuxtLink to="/" class="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
        Vytvořit pipeline →
      </NuxtLink>
    </div>

    <!-- List of runs to choose from -->
    <div v-else class="max-w-lg mx-auto">
      <h1 class="text-lg font-semibold text-gray-800 mb-4">Vyberte pipeline</h1>
      <div class="space-y-2">
        <NuxtLink
          v-for="run in runs"
          :key="run.id"
          :to="`/outreach/${run.id}`"
          class="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-sm font-medium text-gray-800 truncate">{{ run.name }}</span>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                :class="run.mode === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
              >{{ run.mode === 'short' ? 'Zkrácená' : 'Úplná' }}</span>
            </div>
            <p class="text-xs text-gray-400">
              {{ run.author.name }} · {{ new Date(run.createdAt).toLocaleDateString('cs-CZ') }}
              <template v-if="run.stats?.alignments"> · {{ run.stats.alignments }} alignmentů</template>
            </p>
          </div>
          <svg class="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
