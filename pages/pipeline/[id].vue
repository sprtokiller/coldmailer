<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'pipeline' })

const route = useRoute()
const router = useRouter()
const runId = route.params.id as string

const isLegacy = computed(() => route.query.mode === 'legacy')

function toggleMode() {
  if (isLegacy.value) {
    const q = { ...route.query }
    delete q.mode
    router.push({ query: q })
  } else {
    router.push({ query: { ...route.query, mode: 'legacy' } })
  }
}

const pipeline = await usePipelineRunPage()
provide(pipelineRunKey, pipeline)
</script>

<template>
  <div v-if="pipeline.run">
    <div class="max-w-6xl mx-auto px-6 pt-6 mb-8 flex items-start justify-between">
      <div>
        <NuxtLink to="/" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Přehledy</NuxtLink>
        <h1 class="text-2xl font-semibold text-gray-800 mt-2">{{ pipeline.run.name }}</h1>
        <p class="text-sm text-gray-400 mt-1">od {{ pipeline.run.author.name }} · {{ new Date(pipeline.run.createdAt).toLocaleDateString('cs-CZ') }}</p>
      </div>
      <button
        class="mt-2 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
        @click="toggleMode"
      >
        {{ isLegacy ? 'Graf' : 'Klasické zobrazení' }}
      </button>
    </div>

    <template v-if="isLegacy">
      <div class="max-w-6xl mx-auto px-6">
        <div class="space-y-3">
          <PipelineStepCard v-for="(step, idx) in pipeline.steps" :key="step.key" :step="step" :idx="idx" />
        </div>
      </div>
    </template>
    <template v-else>
      <ClientOnly>
        <CanvasPipelineCanvas :run-id="runId" />
      </ClientOnly>
    </template>
  </div>
</template>
