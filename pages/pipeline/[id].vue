<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const pipeline = await usePipelineRunPage()
provide(pipelineRunKey, pipeline)
</script>

<template>
  <div v-if="pipeline.run">
    <div class="mb-8">
      <NuxtLink to="/" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Přehledy</NuxtLink>
      <h1 class="text-2xl font-semibold text-gray-800 mt-2">{{ pipeline.run.name }}</h1>
      <p class="text-sm text-gray-400 mt-1">od {{ pipeline.run.author.name }} · {{ new Date(pipeline.run.createdAt).toLocaleDateString('cs-CZ') }}</p>
    </div>

    <div class="space-y-3">
      <PipelineStepCard v-for="(step, idx) in pipeline.steps" :key="step.key" :step="step" :idx="idx" />
    </div>
  </div>
</template>
