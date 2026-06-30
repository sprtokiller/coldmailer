<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'pipeline' })

const route = useRoute()
const runId = route.params.id as string

const pipeline = await usePipelineRunPage()
provide(pipelineRunKey, pipeline)
</script>

<template>
  <div v-if="pipeline.run">
    <div class="max-w-6xl mx-auto px-6 pt-3 mb-4 flex items-center gap-3">
      <h1 class="text-lg font-semibold text-gray-800">Oslovení</h1>
      <span
        class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
        :class="pipeline.run.mode === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
      >{{ pipeline.run.mode === 'short' ? 'Zkrácená' : 'Úplná' }}</span>
      <span class="text-sm text-gray-400">{{ pipeline.run.name }}</span>
    </div>

    <ClientOnly>
      <PipelineTeamView :run-id="runId" :show-run-picker="true" />
    </ClientOnly>
  </div>
</template>
