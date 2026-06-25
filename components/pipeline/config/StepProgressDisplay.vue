<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'
import type { PartnerProgressItem, SerpPageInfo } from '~/composables/pipeline/types'

const props = defineProps<{ step: StepDefinition }>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const PAGE_STATUS_UI: Record<SerpPageInfo['status'], { icon: string; label: string; class: string }> = {
  loaded: { icon: '✓', label: 'načteno', class: 'text-success' },
  snippet: { icon: '⚠', label: 'nedostupná → snippet', class: 'text-amber-600' },
  unavailable: { icon: '✗', label: 'nedostupná', class: 'text-danger' },
  skipped: { icon: '⊘', label: 'přeskočeno', class: 'text-gray-400' },
}

const partnerItems = computed((): PartnerProgressItem[] => {
  const live = pipeline.partnerProgress[props.step.key] ?? []
  if (live.length) return live

  const output = pipeline.getStepResult(props.step.key)?.outputData as {
    items?: Array<{
      itemName: string
      searchTerm?: string
      serpResults?: number
      pagesLoaded?: number
      pages?: SerpPageInfo[]
      partners?: unknown[]
      error?: string
    }>
  } | undefined

  return (output?.items ?? []).map((item, i, arr) => ({
    index: i + 1,
    total: arr.length,
    itemName: item.itemName,
    searchTerm: item.searchTerm,
    serpResults: item.serpResults,
    pagesLoaded: item.pagesLoaded,
    pages: item.pages,
    partnersFound: item.partners?.length ?? 0,
    status: item.error ? 'error' : 'done',
    error: item.error,
  }))
})
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
  <div v-if="(step.key === 'PARTNER_PROFILING' || step.key === 'OUTREACH_PREPARATION') && pipeline.profilingProgress[step.key]?.length" class="mt-2">
    <p class="text-xs font-medium text-gray-500 mb-2">{{ step.key === 'OUTREACH_PREPARATION' ? 'Průběh přípravy' : 'Průběh profilování' }}</p>
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
  <div v-if="step.key === 'PARTNER_IDENTIFICATION' && partnerItems.length" class="mt-2">
    <p class="text-xs font-medium text-gray-500 mb-2">Průběh položek</p>
    <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
      <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
        <span>#</span><span>Položka</span><span>Hledaný výraz</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span><span class="text-center">Stav</span>
      </div>
      <template v-for="pi in partnerItems" :key="pi.index">
        <div
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
        <div v-if="pi.pages?.length" class="px-3 py-2 bg-gray-50/60 border-t border-gray-50 space-y-1">
          <p class="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Nalezené stránky</p>
          <div
            v-for="page in pi.pages"
            :key="page.url"
            class="flex items-start gap-2 text-[10px] leading-snug"
          >
            <span class="shrink-0 w-3" :class="PAGE_STATUS_UI[page.status].class">{{ PAGE_STATUS_UI[page.status].icon }}</span>
            <div class="min-w-0 flex-1">
              <a :href="page.url" target="_blank" rel="noopener" class="text-primary hover:underline break-all">{{ page.url }}</a>
              <p v-if="page.title" class="text-gray-400 truncate" :title="page.title">{{ page.title }}</p>
            </div>
            <span class="shrink-0 text-gray-400">{{ PAGE_STATUS_UI[page.status].label }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
