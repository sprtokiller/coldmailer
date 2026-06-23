<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'
import { STEP_OUTPUT_SCHEMAS } from '~/config/pipeline'

const props = defineProps<{
  step: StepDefinition
  idx: number
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}

function highlightPlaceholders(text: string): string {
  return text.replace(
    /<\[\[([A-Z_]+)\]\]>/g,
    '<span class="inline-block px-1 py-px rounded bg-violet-100 text-violet-700 border border-violet-200 text-[9px] font-semibold">&lt;[[$1]]&gt;</span>',
  )
}

const stepSchema = computed(() => STEP_OUTPUT_SCHEMAS[props.step.key] ?? null)
const schemaPreviewExpanded = ref(false)

// ── Context part combobox ─────────────────────────────────────────────────────
const contextSearch = ref('')
const showContextDropdown = ref(false)

const selectedContextParts = computed(() =>
  pipeline.getConfig(props.step.key).contextPartIds
    .map(id => pipeline.contextParts.find(cp => cp.id === id))
    .filter(Boolean) as Array<{ id: string; name: string; content: string }>,
)

const filteredContextParts = computed(() =>
  pipeline.contextParts.filter(cp =>
    !pipeline.getConfig(props.step.key).contextPartIds.includes(cp.id) &&
    cp.name.toLowerCase().includes(contextSearch.value.toLowerCase()) &&
    cp.stepKeys.includes(props.step.key),
  ),
)

function addContextPart(id: string) {
  const cfg = pipeline.getConfig(props.step.key)
  if (!cfg.contextPartIds.includes(id)) cfg.contextPartIds.push(id)
  contextSearch.value = ''
  showContextDropdown.value = false
}

function removeContextPart(id: string) {
  const cfg = pipeline.getConfig(props.step.key)
  cfg.contextPartIds = cfg.contextPartIds.filter(cid => cid !== id)
}

function onSearchBlur() {
  setTimeout(() => { showContextDropdown.value = false }, 150)
}

// ── Step execution with local validation ─────────────────────────────────────
const submitAttempted = ref(false)

function handleExecute() {
  submitAttempted.value = true
  pipeline.executeStep(props.step.key)
}

// ── Save-to-library modal ─────────────────────────────────────────────────────
const saveModalOpen = ref(false)
const saveModalName = ref('')
const savingToLibrary = ref(false)
const saveModalInput = ref<HTMLInputElement | null>(null)

function openSaveModal() {
  saveModalName.value = ''
  saveModalOpen.value = true
  nextTick(() => saveModalInput.value?.focus())
}

async function confirmSaveToLibrary() {
  if (!saveModalName.value.trim() || savingToLibrary.value) return
  savingToLibrary.value = true
  try {
    await pipeline.saveContextPartToLibrary(props.step.key, saveModalName.value.trim())
    saveModalOpen.value = false
  } finally {
    savingToLibrary.value = false
  }
}

// ── Edit context part modal ───────────────────────────────────────────────────
const editModalOpen = ref(false)
const editModalId = ref('')
const editModalName = ref('')
const editModalContent = ref('')
const savingEdit = ref(false)
const editModalNameInput = ref<HTMLInputElement | null>(null)

function openEditModal(cp: { id: string; name: string; content: string }) {
  editModalId.value = cp.id
  editModalName.value = cp.name
  editModalContent.value = cp.content
  editModalOpen.value = true
  nextTick(() => editModalNameInput.value?.focus())
}

async function confirmEditContextPart() {
  if (!editModalName.value.trim() || savingEdit.value) return
  savingEdit.value = true
  try {
    const updated = await $fetch<{ id: string; name: string; content: string }>(
      `/api/library/context-parts/${editModalId.value}`,
      { method: 'PATCH', body: { name: editModalName.value.trim(), content: editModalContent.value } },
    )
    const cp = pipeline.contextParts.find(c => c.id === updated.id)
    if (cp) { cp.name = updated.name; cp.content = updated.content }
    editModalOpen.value = false
  } finally {
    savingEdit.value = false
  }
}
</script>

<template>
  <div>
    <!-- ── System prompt selector ─────────────────────────────────────────── -->
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
            class="absolute right-0 top-full z-50 pt-1 w-96"
          >
          <div class="bg-white rounded-xl border border-gray-200 shadow-xl p-4">
            <div class="flex items-start justify-between mb-3">
              <div class="min-w-0">
                <p class="font-medium text-gray-800 text-sm truncate">{{ pipeline.selectedPrompt(step.key)?.name }}</p>
                <p class="text-xs text-gray-400 mt-0.5">by {{ pipeline.selectedPrompt(step.key)?.author?.name }}</p>
              </div>
              <a
                :href="`/library?editId=${pipeline.getConfig(step.key).systemPromptId}`"
                target="_blank"
                class="shrink-0 ml-3 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium whitespace-nowrap"
              >
                Upravit v Knihovně →
              </a>
            </div>
            <div class="relative group/pre">
              <pre class="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed" v-html="highlightPlaceholders(pipeline.selectedPrompt(step.key)?.content ?? '')" />
              <button
                type="button"
                class="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors opacity-0 group-hover/pre:opacity-100"
                @click.stop="pipeline.copyDeepResearchPrompt('prompt_preview_' + step.key, pipeline.selectedPrompt(step.key)?.content ?? '')"
              >
                {{ pipeline.copiedPromptKey === 'prompt_preview_' + step.key ? 'Zkopírováno!' : 'Kopírovat' }}
              </button>
            </div>
            <!-- Schema preview -->
            <div v-if="stepSchema" class="mt-2">
              <button
                type="button"
                class="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                @click.stop="schemaPreviewExpanded = !schemaPreviewExpanded"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                {{ schemaPreviewExpanded ? 'Skrýt schéma' : 'Výstupní schéma (read-only)' }}
              </button>
              <pre v-if="schemaPreviewExpanded" class="mt-1 text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed border border-gray-200">{{ JSON.stringify(stepSchema, null, 2) }}</pre>
            </div>
          </div>
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

    <!-- ── Context parts ──────────────────────────────────────────────────── -->
    <div class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">Kontextové části</label>

      <div v-if="selectedContextParts.length" class="flex flex-wrap gap-1 mb-2">
        <span
          v-for="cp in selectedContextParts"
          :key="cp.id"
          class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
        >
          {{ cp.name }}
          <button
            type="button"
            class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors leading-none text-[10px]"
            title="Upravit"
            @click="openEditModal(cp)"
          >
            <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414A2 2 0 019.586 12.414z" />
            </svg>
          </button>
          <button
            type="button"
            class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors leading-none text-[10px]"
            @click="removeContextPart(cp.id)"
          >✕</button>
        </span>
      </div>

      <div class="relative">
        <input
          v-model="contextSearch"
          type="text"
          :placeholder="filteredContextParts.length || contextSearch ? 'Vyhledat a přidat z knihovny…' : 'Žádné části pro tento krok'"
          :disabled="!pipeline.contextParts.length"
          class="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400"
          @focus="showContextDropdown = true"
          @click="showContextDropdown = true"
          @blur="onSearchBlur"
        />
        <div
          v-if="showContextDropdown && filteredContextParts.length"
          class="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto"
        >
          <button
            v-for="cp in filteredContextParts"
            :key="cp.id"
            type="button"
            class="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-primary/5 hover:text-primary transition-colors"
            @mousedown.prevent="addContextPart(cp.id)"
          >
            {{ cp.name }}
          </button>
        </div>
        <div
          v-else-if="showContextDropdown && contextSearch && !filteredContextParts.length"
          class="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl px-3 py-2 text-xs text-gray-400"
        >
          Žádná shoda
        </div>
      </div>

      <div class="mt-3">
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-gray-500">
            Vlastní kontext
            <span
              v-if="pipeline.getConfig(step.key).manualContext"
              class="ml-1.5 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium"
            >Ad-hoc</span>
          </label>
          <button
            v-if="pipeline.getConfig(step.key).manualContext.trim()"
            type="button"
            class="text-[10px] text-primary hover:underline"
            @click="openSaveModal"
          >
            Uložit do knihovny
          </button>
        </div>
        <textarea
          v-model="pipeline.getConfig(step.key).manualContext"
          rows="3"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          placeholder="Zadejte vlastní kontext specifický pro tento krok…"
        />
      </div>
    </div>

    <!-- ── Modals ─────────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="saveModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        @click.self="saveModalOpen = false"
      >
        <div class="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[calc(100vw-2rem)]">
          <h3 class="font-semibold text-gray-800 mb-1">Uložit do knihovny</h3>
          <p class="text-xs text-gray-400 mb-4">Kontext bude uložen a automaticky přidán do tohoto kroku.</p>
          <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
          <input
            ref="saveModalInput"
            v-model="saveModalName"
            type="text"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Např. o spolku SCG..."
            @keydown.enter="confirmSaveToLibrary"
            @keydown.escape="saveModalOpen = false"
          />
          <div class="flex gap-2 mt-4 justify-end">
            <button type="button" class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2" @click="saveModalOpen = false">Zrušit</button>
            <button
              type="button"
              class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="!saveModalName.trim() || savingToLibrary"
              @click="confirmSaveToLibrary"
            >{{ savingToLibrary ? 'Ukládám…' : 'Uložit' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="editModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        @click.self="editModalOpen = false"
      >
        <div class="bg-white rounded-2xl shadow-2xl p-6 w-[32rem] max-w-[calc(100vw-2rem)]">
          <h3 class="font-semibold text-gray-800 mb-1">Upravit kontextovou část</h3>
          <p class="text-xs text-gray-400 mb-4">Změny se uloží do knihovny a projeví se všude, kde je část použita.</p>
          <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
          <input
            ref="editModalNameInput"
            v-model="editModalName"
            type="text"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
            placeholder="Název kontextové části"
            @keydown.escape="editModalOpen = false"
          />
          <label class="block text-xs font-medium text-gray-500 mb-1">Obsah</label>
          <textarea
            v-model="editModalContent"
            rows="8"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            placeholder="Obsah kontextové části…"
            @keydown.escape="editModalOpen = false"
          />
          <div class="flex gap-2 mt-4 justify-end">
            <button type="button" class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2" @click="editModalOpen = false">Zrušit</button>
            <button
              type="button"
              class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="!editModalName.trim() || savingEdit"
              @click="confirmEditContextPart"
            >{{ savingEdit ? 'Ukládám…' : 'Uložit' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Step-specific config sections ───────────────────────────────────── -->
    <PipelineConfigValueAlignmentConfig
      v-if="step.key === 'VALUE_ALIGNMENT'"
      :step="step"
      :submit-attempted="submitAttempted"
    />

    <PipelineConfigPartnerProfilingConfig
      v-if="step.key === 'PARTNER_PROFILING'"
      :step="step"
    />

    <div v-if="idx > 0 && !['PARTNER_PROFILING', 'PARTNER_IDENTIFICATION', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION'].includes(step.key)" class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">
        Vstupní data (JSON)
        <button type="button" class="ml-2 text-primary hover:underline" @click="pipeline.getConfig(step.key).inputData = pipeline.prevStepOutput(step.key)">
          ← načíst z předchozího kroku
        </button>
      </label>
      <textarea
        v-model="pipeline.getConfig(step.key).inputData"
        rows="4"
        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
        placeholder="{}"
      />
    </div>

    <PipelineConfigOutreachPrepConfig
      v-if="step.key === 'OUTREACH_PREPARATION'"
      :step="step"
      :submit-attempted="submitAttempted"
    />

    <!-- ── Execute button ──────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap mt-4">
      <button
        :disabled="pipeline.executingStep !== null"
        class="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
        @click="handleExecute"
      >
        <svg v-if="pipeline.executingStep === step.key" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {{ pipeline.executingStep === step.key ? 'Probíhá…' : 'Spustit krok' }}
      </button>

      <p v-if="pipeline.executingStep && pipeline.executingRunner" class="text-xs text-gray-400">
        {{ pipeline.executingStep === step.key ? 'Zpracovává' : 'Blokuje' }}: {{ pipeline.executingRunner.name }}
      </p>

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
    </div>

    <!-- ── Progress display ────────────────────────────────────────────────── -->
    <PipelineConfigStepProgressDisplay :step="step" />
  </div>
</template>
