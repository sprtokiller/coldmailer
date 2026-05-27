<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'pipeline' })

const route = useRoute()
const runId = route.params.id as string

const pipeline = await usePipelineRunPage()
provide(pipelineRunKey, pipeline)
</script>

<template>
  <div v-if="pipeline.run">
    <div class="max-w-6xl mx-auto px-6 pt-6 mb-8 flex items-start">
      <div>
        <NuxtLink to="/" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Přehledy</NuxtLink>
        <h1 class="text-2xl font-semibold text-gray-800 mt-2">{{ pipeline.run.name }}</h1>
        <p class="text-sm text-gray-400 mt-1">od {{ pipeline.run.author.name }} · {{ new Date(pipeline.run.createdAt).toLocaleDateString('cs-CZ') }}</p>
      </div>
    </div>

    <ClientOnly>
      <CanvasPipelineCanvas :run-id="runId" />
    </ClientOnly>
  </div>
</template>
