<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
  submitAttempted: boolean
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
</script>

<template>
  <div class="mt-4">
    <label class="block text-xs font-medium text-gray-500 mb-1">
      Prodejní argument
      <span class="text-danger ml-1">*</span>
    </label>
    <select
      v-model="pipeline.getConfig(step.key).sellingPointId"
      class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
      :class="submitAttempted && !pipeline.getConfig(step.key).sellingPointId
        ? 'border-danger/50 focus:ring-danger/30 bg-danger/5'
        : 'border-gray-200 focus:ring-primary/30'"
    >
      <option value="">— vyberte argument —</option>
      <option v-for="sp in pipeline.sellingPoints" :key="sp.id" :value="sp.id">
        {{ sp.name }}
      </option>
    </select>
    <p
      class="mt-1 text-xs text-danger"
      :class="{ invisible: !(submitAttempted && !pipeline.getConfig(step.key).sellingPointId) }"
    >
      Prodejní argument je povinný – bez něj AI nezná vaše argumenty a analýza shody nedává smysl.
    </p>
  </div>

  <div class="mt-4">
    <div v-if="pipeline.step4Partners().length === 0" class="text-xs text-gray-400 py-2">
      Nejprve spusťte Krok 3 (Partner Profiling), abyste získali kandidáty.
    </div>
    <template v-else>
      <div class="flex items-center justify-between mb-2">
        <label class="block text-xs font-medium text-gray-500">
          Partneři z Kroku 3
          <span class="ml-1 font-normal text-gray-400">({{ pipeline.step4SelectedCount() }} / {{ pipeline.step4Partners().length }} vybráno)</span>
        </label>
        <div class="flex items-center gap-3">
          <button type="button" class="text-xs text-primary hover:underline" @click="pipeline.step4SelectAll()">Vše</button>
          <button type="button" class="text-xs text-amber-500 hover:underline" @click="pipeline.step4SelectUnprocessed()">Neanalyzované</button>
          <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step4DeselectAll()">Žádné</button>
        </div>
      </div>
      <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
        <div class="grid grid-cols-[1.5rem_1fr_6rem_4rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span></span><span>Partner</span><span>Odvětví</span><span>Web</span><span></span>
        </div>
        <label
          v-for="p in pipeline.step4Partners()"
          :key="p.name"
          class="grid grid-cols-[1.5rem_1fr_6rem_4rem_2rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
          :class="pipeline.step4SelectedIds[p.name] ? '' : 'opacity-50'"
        >
          <input type="checkbox" v-model="pipeline.step4SelectedIds[p.name]" class="accent-primary" />
          <span class="font-medium text-gray-700 truncate flex items-center gap-1" :title="p.name">
            <span v-if="pipeline.step4IsPartnerProcessed(p)" class="shrink-0 text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold">✓ Hotovo</span>
            {{ p.name }}
          </span>
          <span class="text-gray-400 truncate text-[10px]" :title="String(p.industry ?? '')">{{ p.industry ?? '–' }}</span>
          <a
            v-if="p.website"
            :href="p.website"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary text-[10px] hover:underline truncate"
            @click.stop
          >Web ↗</a>
          <span v-else class="text-gray-300 text-[10px]">–</span>
          <button
            type="button"
            class="flex items-center justify-center text-gray-300 hover:text-primary transition-colors"
            :title="pipeline.copiedPromptKey === step.key + '_' + p.name ? 'Zkopírováno!' : 'Kopírovat prompt pro ' + p.name"
            @click.stop.prevent="pipeline.copyDeepResearchPrompt(step.key + '_' + p.name, pipeline.step4PartnerCopyPrompt(step.key, p.name))"
          >
            <svg v-if="pipeline.copiedPromptKey !== step.key + '_' + p.name" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </label>
      </div>
    </template>
  </div>
</template>
