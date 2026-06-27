<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'
import type { Step3Candidate } from '~/composables/pipeline/types'

defineProps<{ step: StepDefinition }>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const provenanceCandidate = ref<Step3Candidate | null>(null)
const profileImportCandidate = ref<Step3Candidate | null>(null)
const provenanceSources = computed(() => [...new Set(provenanceCandidate.value?.itemNames ?? [])])
</script>

<template>
  <div class="mt-4">
    <div v-if="pipeline.step3Candidates().length === 0" class="text-xs text-gray-400 py-2">
      Nejprve spusťte Krok 2 (Partner Identification), abyste získali kandidáty.
    </div>
    <template v-else>
      <div class="flex items-center justify-between mb-2">
        <label class="block text-xs font-medium text-gray-500">
          Kandidáti z Kroku 2
          <span class="ml-1 font-normal text-gray-400">({{ pipeline.step3SelectedCount() }} / {{ pipeline.step3FilteredCandidates().length }} vybráno)</span>
        </label>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1.5 text-xs text-gray-500">
            Min. výskytů:
            <input
              v-model.number="pipeline.step3FreqFilter"
              type="number"
              min="1"
              :max="pipeline.step3Candidates()[0]?.frequency ?? 1"
              class="w-12 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <button type="button" class="text-xs text-primary hover:underline" @click="pipeline.step3SelectAll()">Vše</button>
          <button type="button" class="text-xs text-amber-500 hover:underline" @click="pipeline.step3SelectUnprocessed()">Nevypracované</button>
          <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step3DeselectAll()">Žádné</button>
        </div>
      </div>
      <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
        <div class="grid grid-cols-[1.5rem_1fr_4rem_2rem_2rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span></span><span>Partner</span><span class="text-center">Výskytů</span><span></span><span></span><span></span>
        </div>
        <label
          v-for="c in pipeline.step3FilteredCandidates()"
          :key="c.partnerId"
          class="grid grid-cols-[1.5rem_1fr_4rem_2rem_2rem_2rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
          :class="[
            pipeline.step3SelectedIds[c.partnerId] ? '' : 'opacity-50',
            c.source === 'direct' ? 'bg-amber-50/40' : '',
          ]"
        >
          <input type="checkbox" v-model="pipeline.step3SelectedIds[c.partnerId]" class="accent-primary" />
          <span class="font-medium text-gray-700 truncate flex items-center gap-1" :title="c.name">
            <span v-if="pipeline.step3IsCandidateProcessed(c)" class="shrink-0 text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold">✓ Hotovo</span>
            <span v-else-if="c.source === 'direct'" class="shrink-0 text-[9px] bg-amber-100 text-amber-600 px-1 py-0.5 rounded font-semibold">přímý import</span>
            {{ c.name }}
          </span>
          <span
            class="text-center font-semibold"
            :class="c.source === 'direct' ? 'text-amber-400' : c.frequency > 1 ? 'text-primary' : 'text-gray-400'"
          >{{ c.source === 'direct' ? '–' : c.frequency + '×' }}</span>
          <button
            type="button"
            class="flex items-center justify-center text-gray-300 hover:text-primary transition-colors"
            :title="'Nahrát profil pro ' + c.name"
            @click.stop.prevent="profileImportCandidate = c"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v10m0 0l4-4m-4 4L8 9" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 17v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
            </svg>
          </button>
          <button
            type="button"
            class="flex items-center justify-center text-gray-300 hover:text-primary transition-colors"
            :title="'Zobrazit zdroje pro ' + c.name"
            @click.stop.prevent="provenanceCandidate = c"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            type="button"
            class="flex items-center justify-center text-gray-300 hover:text-primary transition-colors"
            :title="pipeline.copiedPromptKey === step.key + '_' + c.partnerId ? 'Zkopírováno!' : 'Kopírovat prompt pro ' + c.name"
            @click.stop.prevent="pipeline.copyDeepResearchPrompt(step.key + '_' + c.partnerId, pipeline.step3PartnerCopyPrompt(step.key, c))"
          >
            <svg v-if="pipeline.copiedPromptKey !== step.key + '_' + c.partnerId" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

  <!-- Partner provenance modal -->
  <Teleport to="body">
    <div
      v-if="provenanceCandidate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="provenanceCandidate = null"
    >
      <div class="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[calc(100vw-2rem)]">
        <h3 class="font-semibold text-gray-800 mb-1">{{ provenanceCandidate.name }}</h3>
        <p class="text-xs text-gray-400 mb-4">Kde byl partner nalezen</p>
        <div class="text-xs text-gray-600 space-y-1.5 max-h-64 overflow-y-auto">
          <p v-if="provenanceCandidate.source === 'direct'">Přímo importováno do kroku 3 — nenalezen v Kroku 2.</p>
          <p v-else-if="provenanceCandidate.source === 'imported'">↑ Přidán importem do Kroku 2.</p>
          <p v-else-if="provenanceCandidate.source === 'db'">⊕ Vybrán z globální databáze.</p>
          <template v-if="provenanceSources.length > 0">
            <p class="font-medium text-gray-500">Nalezen {{ provenanceCandidate.frequency }}× v:</p>
            <ul class="list-disc pl-4 space-y-0.5">
              <li v-for="src in provenanceSources" :key="src">{{ src }}</li>
            </ul>
          </template>
          <p v-else-if="provenanceCandidate.source === 'step2'" class="text-gray-400">Bez záznamu o zdroji.</p>
        </div>
        <div class="flex justify-end mt-4">
          <button
            type="button"
            class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2"
            @click="provenanceCandidate = null"
          >Zavřít</button>
        </div>
      </div>
    </div>
  </Teleport>

  <PipelineConfigProfileImportModal
    v-if="profileImportCandidate"
    :global-record-id="profileImportCandidate.partnerId"
    :partner-name="profileImportCandidate.name"
    @close="profileImportCandidate = null"
    @imported="profileImportCandidate = null"
  />
</template>
