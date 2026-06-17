<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

defineProps<{ step: StepDefinition }>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
</script>

<template>
  <!-- Live streaming output -->
  <div v-if="pipeline.executingStep === step.key && pipeline.streamOutputs[step.key]" class="mt-4">
    <p class="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
      <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
      Živý výstup
    </p>
    <pre class="bg-gray-50 border border-primary/20 rounded-lg p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">{{ pipeline.streamOutputs[step.key] }}</pre>
  </div>

  <!-- Partner profiling progress -->
  <div v-if="step.key === 'PARTNER_PROFILING' && pipeline.profilingProgress[step.key]?.length" class="mt-2">
    <p class="text-xs font-medium text-gray-500 mb-2">Průběh profilování</p>
    <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
      <div class="grid grid-cols-[2rem_1fr_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
        <span>#</span><span>Partner</span><span class="text-center">Status</span>
      </div>
      <div
        v-for="pi in pipeline.profilingProgress[step.key]"
        :key="pi.index"
        class="grid grid-cols-[2rem_1fr_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center"
        :class="pi.status === 'error' ? 'bg-red-50' : pi.status === 'done' ? 'bg-white' : 'bg-blue-50/40'"
      >
        <span class="text-gray-400">{{ pi.index }}</span>
        <span class="truncate font-medium text-gray-700" :title="pi.name">{{ pi.name }}</span>
        <span class="text-center">
          <span v-if="pi.status === 'processing'" class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span v-else-if="pi.status === 'done'" class="text-success">✓</span>
          <span v-else class="text-danger text-[10px]" :title="pi.error">✗ {{ pi.error?.slice(0, 30) }}</span>
        </span>
      </div>
    </div>
  </div>

  <!-- Value alignment progress -->
  <div v-if="step.key === 'VALUE_ALIGNMENT' && pipeline.alignmentProgress[step.key]?.length" class="mt-2">
    <p class="text-xs font-medium text-gray-500 mb-2">Průběh analýzy</p>
    <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
      <div class="grid grid-cols-[2rem_1fr_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
        <span>#</span><span>Partner</span><span class="text-center">Status</span>
      </div>
      <div
        v-for="ai in pipeline.alignmentProgress[step.key]"
        :key="ai.index"
        class="grid grid-cols-[2rem_1fr_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center"
        :class="ai.status === 'error' ? 'bg-red-50' : ai.status === 'done' ? 'bg-white' : 'bg-blue-50/40'"
      >
        <span class="text-gray-400">{{ ai.index }}</span>
        <span class="truncate font-medium text-gray-700" :title="ai.name">{{ ai.name }}</span>
        <span class="text-center">
          <span v-if="ai.status === 'processing'" class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span v-else-if="ai.status === 'done'" class="text-success">✓</span>
          <span v-else class="text-danger text-[10px]" :title="ai.error">✗ {{ ai.error?.slice(0, 30) }}</span>
        </span>
      </div>
    </div>
  </div>

  <!-- Partner identification progress -->
  <div v-if="step.key === 'PARTNER_IDENTIFICATION' && pipeline.partnerProgress[step.key]?.length" class="mt-2">
    <p class="text-xs font-medium text-gray-500 mb-2">Průběh položek</p>
    <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
      <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
        <span>#</span><span>Položka</span><span>Hledaný výraz</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span><span class="text-center">Stav</span>
      </div>
      <div
        v-for="pi in pipeline.partnerProgress[step.key]"
        :key="pi.index"
        class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center"
        :class="pi.status === 'error' ? 'bg-red-50' : pi.status === 'done' ? 'bg-white' : 'bg-blue-50/40'"
      >
        <span class="text-gray-400">{{ pi.index }}</span>
        <span class="truncate font-medium text-gray-700" :title="pi.itemName">{{ pi.itemName }}</span>
        <span class="truncate text-gray-400 text-[10px]" :title="pi.searchTerm">{{ pi.searchTerm ?? '…' }}</span>
        <span class="text-center text-gray-500">{{ pi.serpResults ?? '–' }}</span>
        <span class="text-center text-gray-500">{{ pi.pagesLoaded ?? '–' }}</span>
        <span class="text-center font-semibold" :class="pi.partnersFound ? 'text-success' : 'text-gray-400'">{{ pi.partnersFound ?? '–' }}</span>
        <span class="text-center">
          <span v-if="pi.status === 'processing'" class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span v-else-if="pi.status === 'done'" class="text-success">✓</span>
          <span v-else class="text-danger" :title="pi.error">✗</span>
        </span>
      </div>
    </div>
  </div>
</template>
