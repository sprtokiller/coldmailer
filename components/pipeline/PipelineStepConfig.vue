<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'
import type { Step3Candidate } from '~/composables/pipeline/types'

const props = defineProps<{
  step: StepDefinition
  idx: number
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}

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

// ── Signature selector (Step 6) ───────────────────────────────────────────────
const sigs = computed(() => Array.isArray(pipeline.signatures) ? pipeline.signatures : [])
const selectedSignatureId = ref(
  sigs.value.find(s => s.isDefault)?.id ?? '',
)

function onSignatureChange(id: string) {
  selectedSignatureId.value = id
  pipeline.applySignature(id)
}

// ── Partner provenance modal (Step 3) ─────────────────────────────────────────
const provenanceCandidate = ref<Step3Candidate | null>(null)
const provenanceSources = computed(() => [...new Set(provenanceCandidate.value?.itemNames ?? [])])

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
              <pre class="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">{{ pipeline.selectedPrompt(step.key)?.content }}</pre>
              <button
                type="button"
                class="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors opacity-0 group-hover/pre:opacity-100"
                @click.stop="pipeline.copyDeepResearchPrompt('prompt_preview_' + step.key, pipeline.selectedPrompt(step.key)?.content ?? '')"
              >
                {{ pipeline.copiedPromptKey === 'prompt_preview_' + step.key ? 'Zkopírováno!' : 'Kopírovat' }}
              </button>
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

    <div class="mt-4">
      <label class="block text-xs font-medium text-gray-500 mb-1">Kontextové části</label>

      <!-- Selected chips -->
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

      <!-- Combobox -->
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

      <!-- Manual context -->
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

    <!-- Save-to-library modal -->
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
            <button
              type="button"
              class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2"
              @click="saveModalOpen = false"
            >Zrušit</button>
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

    <!-- Edit context part modal -->
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
            <button
              type="button"
              class="text-sm text-gray-400 hover:text-gray-600 px-4 py-2"
              @click="editModalOpen = false"
            >Zrušit</button>
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

    <div v-if="step.key === 'VALUE_ALIGNMENT'" class="mt-4">
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

    <div v-if="step.key === 'VALUE_ALIGNMENT'" class="mt-4">
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
            <button type="button" class="text-xs text-amber-500 hover:underline" @click="pipeline.step3SelectUnprocessed()">Nevypracované</button>
            <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step3DeselectAll()">Žádné</button>
          </div>
        </div>
        <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
          <div class="grid grid-cols-[1.5rem_1fr_4rem_2rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
            <span></span><span>Partner</span><span class="text-center">Výskytů</span><span></span><span></span>
          </div>
          <label
            v-for="c in pipeline.step3FilteredCandidates()"
            :key="c.partnerId"
            class="grid grid-cols-[1.5rem_1fr_4rem_2rem_2rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
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

    <div v-if="idx > 0 && !['PARTNER_PROFILING', 'PARTNER_IDENTIFICATION', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION'].includes(step.key)" class="mt-4">
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

    <!-- ── Step 5: OUTREACH_PREPARATION ──────────────────────────────────────── -->
    <div v-if="step.key === 'OUTREACH_PREPARATION'" class="mt-4 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">
          E-mailová šablona
          <span class="text-danger ml-1">*</span>
        </label>
        <select
          v-model="pipeline.getConfig(step.key).emailDraftId"
          class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
          :class="submitAttempted && !pipeline.getConfig(step.key).emailDraftId
            ? 'border-danger/50 focus:ring-danger/30 bg-danger/5'
            : 'border-gray-200 focus:ring-primary/30'"
        >
          <option value="">— vyberte šablonu z knihovny —</option>
          <option v-for="d in pipeline.emailDrafts" :key="d.id" :value="d.id">
            {{ d.name }} · {{ d.subject }}
          </option>
        </select>
        <p
          class="mt-1 text-xs text-danger"
          :class="{ invisible: !(submitAttempted && !pipeline.getConfig(step.key).emailDraftId) }"
        >
          E-mailová šablona je povinná – AI ji použije jako základ pro personalizaci.
        </p>
      </div>

      <div v-if="pipeline.step5Alignments().length === 0" class="text-xs text-gray-400 py-2">
        Nejprve spusťte Krok 4 (Value Alignment), abyste získali partnery pro oslovení.
      </div>
      <template v-else>
        <div class="flex items-center justify-between mb-2">
          <label class="block text-xs font-medium text-gray-500">
            Partneři z Kroku 4
            <span class="ml-1 font-normal text-gray-400">({{ pipeline.step5SelectedCount() }} / {{ pipeline.step5Alignments().length }} vybráno)</span>
          </label>
          <div class="flex items-center gap-3">
            <button type="button" class="text-xs text-primary hover:underline" @click="pipeline.step5SelectAll()">Vše</button>
            <button type="button" class="text-xs text-amber-500 hover:underline" @click="pipeline.step5SelectUnprocessed()">Nevypracované</button>
            <button type="button" class="text-xs text-gray-400 hover:underline" @click="pipeline.step5DeselectAll()">Žádné</button>
          </div>
        </div>
        <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
          <div class="grid grid-cols-[1.5rem_1fr_10rem_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
            <span></span><span>Partner</span><span>Celková shoda</span><span>Top argument</span>
          </div>
          <label
            v-for="a in pipeline.step5Alignments()"
            :key="String(a.name ?? '')"
            class="grid grid-cols-[1.5rem_1fr_10rem_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
            :class="pipeline.step5SelectedIds[String(a.name ?? '')] ? '' : 'opacity-50'"
          >
            <input type="checkbox" v-model="pipeline.step5SelectedIds[String(a.name ?? '')]" class="accent-primary" />
            <span class="font-medium text-gray-700 truncate" :title="String(a.name ?? '')">{{ a.name }}</span>
            <span
              class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
              :class="a.overallFitScore === 'Vysoký' ? 'text-success bg-success/10' : a.overallFitScore === 'Střední' ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-100'"
            >{{ a.overallFitScore ?? '–' }}</span>
            <span class="text-gray-400 truncate text-[10px]">
              {{ Array.isArray(a.top3Arguments) && (a.top3Arguments as Record<string, unknown>[]).length
                ? String((a.top3Arguments as Record<string, unknown>[])[0].argumentId ?? '')
                : '–' }}
            </span>
          </label>
        </div>
      </template>
    </div>

    <!-- ── Step 6: OUTREACH_EXECUTION ─────────────────────────────────────────── -->
    <div v-if="step.key === 'OUTREACH_EXECUTION'" class="mt-4 space-y-4">
      <div v-if="pipeline.outreachEmails().length === 0" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Nejprve spusťte Krok 5 (Outreach Preparation) pro vygenerování e-mailů.
      </div>
      <template v-else>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">
            Vyberte partnera k odeslání
            <span class="text-danger ml-1">*</span>
          </label>
          <select
            v-model="pipeline.step6SelectedPartnerName"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            @change="pipeline.step6SelectedPartnerName && pipeline.initStep6Preview(pipeline.step6SelectedPartnerName)"
          >
            <option value="">— vyberte partnera —</option>
            <option
              v-for="email in pipeline.outreachEmails().filter(e => !e.error)"
              :key="String(email.partnerName ?? '')"
              :value="String(email.partnerName ?? '')"
            >
              {{ email.partnerName }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Podpis</label>
          <select
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            :value="selectedSignatureId"
            @change="onSignatureChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">— bez podpisu —</option>
            <option v-for="sig in sigs" :key="sig.id" :value="sig.id">
              {{ sig.name }}{{ sig.isDefault ? ' (výchozí)' : '' }}
            </option>
          </select>
        </div>

        <template v-if="pipeline.step6SelectedPartnerName">
          <div class="space-y-3 rounded-xl border border-primary/20 bg-primary/3 p-4">
            <p class="text-xs font-semibold text-primary mb-1">Náhled e-mailu · upravte před odesláním</p>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Příjemce (To)</label>
              <input
                v-model="pipeline.step6PreviewTo"
                type="email"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="jmeno@firma.cz"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Předmět</label>
              <input
                v-model="pipeline.step6PreviewSubject"
                type="text"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Tělo e-mailu</label>
              <RichTextEditor v-model="pipeline.step6PreviewBody" />
            </div>
            <p class="text-[11px] text-gray-400">Kliknutím na „Spustit krok" vytvoříte draft přímo v Gmailu s výše uvedenými daty.</p>
          </div>
        </template>
      </template>
    </div>

    <div class="flex items-center gap-2 flex-wrap mt-4">
      <button
        :disabled="pipeline.executingStep !== null || (step.key === 'OUTREACH_EXECUTION' && (!pipeline.step6SelectedPartnerName || !pipeline.step6PreviewTo || !pipeline.step6PreviewSubject || !pipeline.step6PreviewBody))"
        class="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
        @click="handleExecute"
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
