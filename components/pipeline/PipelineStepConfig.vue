<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
  idx: number
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}
</script>

<template>
  <div>
    <div>
      <label class="block text-xs font-medium text-gray-500 mb-1">Systémový prompt</label>
      <div class="flex items-center gap-2">
        <select
          v-model="pipeline.getConfig(step.key).systemPromptId"
          class="flex-1 border border-gray-200 rounded-lg px-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option
            v-for="p in pipeline.promptsForStep(step.key)"
            :key="p.id"
            :value="p.id"
          >
            {{ p.isSystem ? '⚙ ' : '' }}{{ p.name }}{{ p.isSystem ? '' : ' · ' + p.author.name }}
          </option>
        </select>

        <div
          v-if="pipeline.getConfig(step.key).systemPromptId"
          class="relative shrink-0"
          @mouseenter="pipeline.promptPreviewStep = step.key"
          @mouseleave="pipeline.promptPreviewStep = null"
        >
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors"
            tabindex="-1"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>

          <div
            v-if="pipeline.promptPreviewStep === step.key"
            class="absolute right-0 top-full mt-1 z-50 w-96 bg-white rounded-xl border border-gray-200 shadow-xl p-4"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="min-w-0">
                <p class="font-medium text-gray-800 text-sm truncate">{{ pipeline.selectedPrompt(step.key)?.name }}</p>
                <p class="text-xs text-gray-400 mt-0.5">by {{ pipeline.selectedPrompt(step.key)?.author?.name }}</p>
              </div>
              <a
                href="/library"
                target="_blank"
                class="shrink-0 ml-3 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium whitespace-nowrap"
              >
                Upravit v Knihovně →
              </a>
            </div>
            <pre class="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">{{ pipeline.selectedPrompt(step.key)?.content }}</pre>
          </div>
        </div>

        <NuxtLink
          :to="`/library?action=new&stepType=${step.key}`"
          class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
          title="Vytvořit nový prompt"
          tabindex="-1"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </NuxtLink>
      </div>
    </div>

    <div class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">Kontextové části</label>
      <div v-if="pipeline.contextParts.length" class="space-y-1 max-h-32 overflow-y-auto">
        <label
          v-for="cp in pipeline.contextParts"
          :key="cp.id"
          class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
        >
          <input
            type="checkbox"
            :value="cp.id"
            v-model="pipeline.getConfig(step.key).contextPartIds"
            class="accent-primary"
          />
          {{ cp.name }}
        </label>
      </div>
      <p v-else class="text-xs text-gray-400">V knihovně zatím nejsou žádné kontextové části.</p>
    </div>

    <div v-if="step.key === 'VALUE_ALIGNMENT'" class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">Prodejní argument</label>
      <select
        v-model="pipeline.getConfig(step.key).sellingPointId"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Žádný</option>
        <option v-for="sp in pipeline.sellingPoints" :key="sp.id" :value="sp.id">
          {{ sp.name }}
        </option>
      </select>
    </div>

    <div v-if="step.key === 'PARTNER_PROFILING'" class="mt-4">
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
            <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step3DeselectAll()">Žádné</button>
          </div>
        </div>
        <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
          <div class="grid grid-cols-[1.5rem_1fr_4rem_1fr_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
            <span></span><span>Partner</span><span class="text-center">Výskytů</span><span>Nalezen v</span><span></span>
          </div>
          <label
            v-for="c in pipeline.step3FilteredCandidates()"
            :key="c.partnerId"
            class="grid grid-cols-[1.5rem_1fr_4rem_1fr_2rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
            :class="pipeline.step3SelectedIds[c.partnerId] ? '' : 'opacity-50'"
          >
            <input type="checkbox" v-model="pipeline.step3SelectedIds[c.partnerId]" class="accent-primary" />
            <span class="font-medium text-gray-700 truncate" :title="c.name">{{ c.name }}</span>
            <span class="text-center font-semibold" :class="c.frequency > 1 ? 'text-primary' : 'text-gray-400'">{{ c.frequency }}×</span>
            <span class="text-gray-400 truncate text-[10px]" :title="c.itemNames.join(', ')">{{ c.itemNames.join(', ') }}</span>
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

    <div v-if="idx > 0 && step.key !== 'PARTNER_PROFILING'" class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">
        Vstupní data (JSON)
        <button type="button" class="ml-2 text-primary hover:underline" @click="pipeline.getConfig(step.key).inputData = pipeline.prevStepOutput(step.key)">
          ← načíst z předchozího kroku
        </button>
      </label>
      <textarea
        v-model="pipeline.getConfig(step.key).inputData"
        rows="4"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        placeholder="{}"
      />
    </div>

    <div class="flex items-center gap-2 flex-wrap mt-4">
      <button
        :disabled="pipeline.executingStep !== null"
        class="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
        @click="pipeline.executeStep(step.key)"
      >
        <svg v-if="pipeline.executingStep === step.key" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ pipeline.executingStep === step.key ? 'Probíhá…' : 'Spustit krok' }}
      </button>

      <button
        v-if="step.key === 'MARKET_SCANNING'"
        type="button"
        class="border border-primary/30 text-primary px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors flex items-center gap-2"
        @click="pipeline.copyDeepResearchPrompt(step.key, pipeline.step1CopyPrompt(step.key))"
      >
        <svg v-if="pipeline.copiedPromptKey !== step.key" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <svg v-else class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
        {{ pipeline.copiedPromptKey === step.key ? 'Zkopírováno!' : 'Kopírovat prompt' }}
      </button>

      <button
        v-if="pipeline.isAiImportStep(step.key)"
        type="button"
        class="border border-violet-300 text-violet-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-violet-50 disabled:opacity-50 transition-colors flex items-center gap-2"
        :disabled="pipeline.aiImportLoading"
        @click="pipeline.toggleAiImport(step.key)"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {{ pipeline.aiImportStep === step.key ? 'Zavřít import' : 'AI Import' }}
      </button>
    </div>

    <div v-if="pipeline.isAiImportStep(step.key) && pipeline.aiImportStep === step.key" class="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3 mt-4">
      <p class="text-xs font-medium text-violet-700">
        AI Import – vložte nestrukturovaná data z externího nástroje. Claude je automaticky převede do správného formátu a sloučí s existujícími výsledky.
      </p>
      <textarea
        v-model="pipeline.aiImportText"
        rows="7"
        class="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none bg-white"
        placeholder="Vložte text, CSV, výstup z externího nástroje…"
      />
      <div class="flex gap-2">
        <button
          class="bg-violet-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
          :disabled="pipeline.aiImportLoading || !pipeline.aiImportText.trim()"
          @click="pipeline.runAiImport(step.key)"
        >
          <svg v-if="pipeline.aiImportLoading" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ pipeline.aiImportLoading ? 'Zpracovávám…' : 'Importovat a sloučit' }}
        </button>
        <button type="button" class="text-xs text-gray-400 hover:text-gray-600 px-3" @click="pipeline.aiImportStep = null">Zrušit</button>
      </div>
    </div>

    <div v-if="pipeline.executingStep === step.key && pipeline.streamOutputs[step.key]" class="mt-4">
      <p class="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
        Živý výstup
      </p>
      <pre class="bg-gray-50 border border-primary/20 rounded-lg p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">{{ pipeline.streamOutputs[step.key] }}</pre>
    </div>

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
  </div>
</template>
