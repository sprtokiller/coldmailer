<script setup lang="ts">
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import { outreachWorkspaceKey, outreachActionsKey } from '~/composables/canvas/useOutreachWorkspace'
import { GROUP_FONTS, STEP_OUTPUT_SCHEMAS } from '~/config/pipeline'

const pipeline = inject(pipelineRunKey) as PipelineRunContext
const workspace = inject(outreachWorkspaceKey)!
const actions = inject(outreachActionsKey)!
const { notifications: globalSendNotifs } = useSendNotifications()
const hasPendingSend = computed(() =>
  globalSendNotifs.value.some(n => n.status === 'pending' && n.partnerName === workspace.selectedPartner.value),
)

const STEP_KEY = 'OUTREACH_PREPARATION'

const cfg = computed(() => pipeline.getConfig(STEP_KEY))

// ── Previews ─────────────────────────────────────────────────────────────────
const previewField = ref<string | null>(null)

const selectedPrompt = computed(() => {
  const id = cfg.value.systemPromptId
  if (!id) return null
  return pipeline.promptsForStep(STEP_KEY).find(p => p.id === id) ?? null
})

const selectedDraft = computed(() => {
  const id = cfg.value.emailDraftId
  if (!id) return null
  return pipeline.emailDrafts.find(d => d.id === id) ?? null
})

const selectedSig = computed(() => {
  if (!selectedSignatureId.value) return null
  return sigs.value.find(s => s.id === selectedSignatureId.value) ?? null
})

// ── Context part combobox ─────────────────────────────────────────────────────
const contextSearch = ref('')
const showContextDropdown = ref(false)

const selectedContextParts = computed(() =>
  cfg.value.contextPartIds
    .map(id => pipeline.contextParts.find(cp => cp.id === id))
    .filter(Boolean) as Array<{ id: string; name: string; content: string }>,
)

const filteredContextParts = computed(() =>
  pipeline.contextParts.filter(cp =>
    !cfg.value.contextPartIds.includes(cp.id) &&
    cp.name.toLowerCase().includes(contextSearch.value.toLowerCase()) &&
    cp.stepKeys.includes(STEP_KEY),
  ),
)

function addContextPart(id: string) {
  if (!cfg.value.contextPartIds.includes(id)) cfg.value.contextPartIds.push(id)
  contextSearch.value = ''
  showContextDropdown.value = false
}

function removeContextPart(id: string) {
  cfg.value.contextPartIds = cfg.value.contextPartIds.filter(cid => cid !== id)
}

function onSearchBlur() {
  setTimeout(() => { showContextDropdown.value = false }, 150)
}

// ── Signature ─────────────────────────────────────────────────────────────────
const sigs = computed(() => Array.isArray(pipeline.signatures) ? pipeline.signatures : [])
const selectedSignatureId = ref('')

watch(sigs, (val) => {
  if (!selectedSignatureId.value && val.length > 0) {
    selectedSignatureId.value = val.find(s => s.isDefault)?.id ?? val[0]?.id ?? ''
  }
}, { immediate: true })

watch(selectedSignatureId, (id) => {
  ;(cfg.value as any)._selectedSignatureId = id
}, { immediate: true })

// ── Saved state ──────────────────────────────────────────────────────────────
const savedInfo = computed(() => {
  const name = workspace.selectedPartner.value
  if (!name) return null
  const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
  const match = emails.find(e => String(e.partnerName ?? e.name ?? '') === name)
  if (!match?.savedAt) return null
  return {
    name: (match.savedBy as { name: string } | undefined)?.name ?? 'neznámý',
    at: match.savedAt as string,
    sentAt: match.sentAt as string | undefined,
  }
})

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'právě teď'
  if (mins < 60) return `před ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `před ${hours} h`
  return `před ${Math.floor(hours / 24)} d`
}

// ── Execute ───────────────────────────────────────────────────────────────────
function handleGenerate() {
  pipeline.executeStep(STEP_KEY)
}

const defaultFont = computed(() => {
  const slug = pipeline.run?.project?.group?.slug
  return slug ? GROUP_FONTS[slug] ?? '' : ''
})

const outputSchema = computed(() => STEP_OUTPUT_SCHEMAS[STEP_KEY] ?? null)

function highlightPlaceholders(text: string): string {
  return text.replace(
    /<\[\[([A-Z_]+)\]\]>/g,
    '<span class="inline-block px-1 py-px rounded bg-violet-100 text-violet-700 border border-violet-200 text-[9px] font-semibold">&lt;[[$1]]&gt;</span>',
  )
}
const schemaPreviewExpanded = ref(false)

const hasBody = computed(() => !!workspace.emailBody.value.trim())
const hasTo = computed(() => !!workspace.emailTo.value.trim())
const canSave = computed(() => hasBody.value && !!workspace.selectedPartner.value)
const canSend = computed(() => canSave.value && hasTo.value && !!workspace.emailSubject.value.trim())
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Config header -->
    <div class="border-b border-gray-100 px-4 py-2.5">
      <div class="grid grid-cols-3 gap-3 items-end">
        <!-- Col 1: system prompt + email template -->
        <div class="space-y-1.5">
          <!-- System prompt -->
          <div>
            <label class="block text-[10px] font-medium text-gray-400 mb-0.5">Systémový prompt</label>
            <div class="flex items-center gap-1">
              <select
                v-model="cfg.systemPromptId"
                class="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option
                  v-for="p in pipeline.promptsForStep(STEP_KEY)"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.isSystem ? '⚙ ' : '' }}{{ p.name }}{{ p.isSystem ? '' : ' · ' + p.author.name }}
                </option>
              </select>
              <div
                class="relative shrink-0"
                @mouseenter="previewField = 'prompt'"
                @mouseleave="previewField = null"
              >
                <button type="button" class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors" tabindex="-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                <div v-if="previewField === 'prompt' && selectedPrompt" class="absolute right-0 top-full z-50 pt-1 w-80">
                  <div class="bg-white rounded-xl border border-gray-200 shadow-xl p-3 max-h-60 overflow-y-auto">
                    <p class="text-[11px] font-medium text-gray-800 mb-1">{{ selectedPrompt.name }}</p>
                    <ClientOnly><pre class="text-[10px] text-gray-600 whitespace-pre-wrap font-mono leading-relaxed" v-html="highlightPlaceholders(selectedPrompt.content)" /></ClientOnly>
                  </div>
                </div>
              </div>
              <NuxtLink
                :to="`/library?action=new&stepType=${STEP_KEY}`"
                class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                title="Vytvořit nový prompt"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
          </div>

          <!-- Output schema preview -->
          <button
            v-if="outputSchema"
            type="button"
            class="w-full flex items-center gap-1 text-[9px] text-gray-400 hover:text-gray-600 transition-colors -mt-0.5 mb-0.5"
            @click="schemaPreviewExpanded = !schemaPreviewExpanded"
          >
            <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
            {{ schemaPreviewExpanded ? 'Skrýt schéma' : 'Výstupní schéma' }}
          </button>
          <div v-if="schemaPreviewExpanded && outputSchema" class="rounded border border-gray-200 bg-gray-50 px-2 py-1.5 mb-1 max-h-40 overflow-y-auto">
            <pre class="text-[9px] text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{{ JSON.stringify(outputSchema, null, 2) }}</pre>
          </div>

          <!-- Email template -->
          <div>
            <label class="block text-[10px] font-medium text-gray-400 mb-0.5">E-mailová šablona</label>
            <div v-if="pipeline.emailDrafts.length > 0" class="flex items-center gap-1">
              <div class="relative flex-1 min-w-0">
                <select
                  v-model="cfg.emailDraftId"
                  class="w-full border rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1"
                  :class="cfg.emailDraftId ? 'border-gray-200 focus:ring-primary/30' : 'border-amber-300 bg-amber-50 focus:ring-amber-300'"
                >
                  <option value="">— vyberte šablonu —</option>
                  <option v-for="d in pipeline.emailDrafts" :key="d.id" :value="d.id">
                    {{ d.name }} · {{ d.subject }}
                  </option>
                </select>
                <span
                  v-if="!cfg.emailDraftId"
                  class="absolute right-7 top-1/2 -translate-y-1/2 text-amber-500 cursor-help"
                  title="Bez šablony bude e-mail pravděpodobně generický a bude znít jako AI slop."
                >⚠</span>
              </div>
              <div
                class="relative shrink-0"
                @mouseenter="previewField = 'draft'"
                @mouseleave="previewField = null"
              >
                <button type="button" class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors" :class="{ 'opacity-30 pointer-events-none': !selectedDraft }" tabindex="-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                <div v-if="previewField === 'draft' && selectedDraft" class="absolute right-0 top-full z-50 pt-1 w-80">
                  <div class="bg-white rounded-xl border border-gray-200 shadow-xl p-3 max-h-60 overflow-y-auto">
                    <p class="text-[11px] font-medium text-gray-800 mb-1">{{ selectedDraft.name }}</p>
                    <p class="text-[10px] text-gray-500 mb-1">Předmět: {{ selectedDraft.subject }}</p>
                    <pre class="text-[10px] text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{{ selectedDraft.body }}</pre>
                  </div>
                </div>
              </div>
              <NuxtLink
                to="/library?tab=drafts"
                class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                title="Vytvořit novou šablonu"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
            <div
              v-else
              class="flex items-center gap-1"
            >
              <div class="flex-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-600 cursor-help" title="Vytvořte e-mailovou šablonu v Knihovně, aby AI mohla personalizovat e-mail na základě vaší struktury.">
                ⚠ Žádná šablona
              </div>
              <NuxtLink
                to="/library?tab=drafts"
                class="w-6 h-6 flex items-center justify-center rounded border border-amber-300 text-amber-500 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                title="Vytvořit šablonu v Knihovně"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Col 2: signature + context parts -->
        <div class="space-y-1.5">
          <!-- Signature -->
          <div>
            <label class="block text-[10px] font-medium text-gray-400 mb-0.5">Podpis</label>
            <div v-if="sigs.length > 0" class="flex items-center gap-1">
              <div class="relative flex-1 min-w-0">
                <select
                  v-model="selectedSignatureId"
                  class="w-full border rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1"
                  :class="selectedSignatureId ? 'border-gray-200 focus:ring-primary/30' : 'border-amber-300 bg-amber-50 focus:ring-amber-300'"
                >
                  <option value="">— bez podpisu —</option>
                  <option v-for="sig in sigs" :key="sig.id" :value="sig.id">
                    {{ sig.name }}{{ sig.isDefault ? ' (výchozí)' : '' }}
                  </option>
                </select>
                <span
                  v-if="!selectedSignatureId"
                  class="absolute right-7 top-1/2 -translate-y-1/2 text-amber-500 cursor-help"
                  title="Bez podpisu bude doplněn obecný podpis, který je potřeba customizovat."
                >⚠</span>
              </div>
              <div
                class="relative shrink-0"
                @mouseenter="previewField = 'sig'"
                @mouseleave="previewField = null"
              >
                <button type="button" class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors" :class="{ 'opacity-30 pointer-events-none': !selectedSig }" tabindex="-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                <div v-if="previewField === 'sig' && selectedSig" class="absolute right-0 top-full z-50 pt-1 w-72">
                  <div class="bg-white rounded-xl border border-gray-200 shadow-xl p-3 max-h-48 overflow-y-auto">
                    <p class="text-[11px] font-medium text-gray-800 mb-1">{{ selectedSig.name }}</p>
                    <ClientOnly><div class="text-[10px] text-gray-600 leading-relaxed" v-html="selectedSig.content" /></ClientOnly>
                  </div>
                </div>
              </div>
              <NuxtLink
                to="/settings?tab=signatures"
                class="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                title="Spravovat podpisy v Nastavení"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
            <div v-else class="flex items-center gap-1">
              <div class="flex-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-600 cursor-help" title="Vytvořte podpis v Nastavení, aby e-mail vypadal profesionálně.">
                ⚠ Žádný podpis
              </div>
              <NuxtLink
                to="/settings?tab=signatures"
                class="w-6 h-6 flex items-center justify-center rounded border border-amber-300 text-amber-500 hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                title="Vytvořit podpis v Nastavení"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
          </div>

          <!-- Context parts -->
          <div>
            <div class="flex items-center justify-between mb-0.5">
              <label class="text-[10px] font-medium text-gray-400">Kontextové části</label>
              <NuxtLink
                to="/library?tab=contextParts"
                class="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-primary transition-colors"
                title="Spravovat kontextové části v Knihovně"
                tabindex="-1"
                target="_blank"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
              </NuxtLink>
            </div>
            <div v-if="selectedContextParts.length" class="flex flex-wrap gap-0.5 mb-1">
              <span
                v-for="cp in selectedContextParts"
                :key="cp.id"
                class="inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-px bg-primary/10 text-primary text-[9px] rounded-full"
              >
                {{ cp.name }}
                <button
                  type="button"
                  class="w-2.5 h-2.5 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors leading-none text-[8px]"
                  @click="removeContextPart(cp.id)"
                >✕</button>
              </span>
            </div>
            <div class="relative">
              <input
                v-model="contextSearch"
                type="text"
                :placeholder="filteredContextParts.length || contextSearch ? 'Přidat z knihovny…' : 'Žádné části'"
                :disabled="!pipeline.contextParts.length"
                class="w-full border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400"
                @focus="showContextDropdown = true"
                @click="showContextDropdown = true"
                @blur="onSearchBlur"
              />
              <div
                v-if="showContextDropdown && filteredContextParts.length"
                class="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-32 overflow-y-auto"
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
            </div>
          </div>
        </div>

        <!-- Col 3: custom context + generate -->
        <div class="space-y-1.5">
          <div>
            <label class="block text-[10px] font-medium text-gray-400 mb-0.5">Vlastní kontext</label>
            <textarea
              v-model="cfg.manualContext"
              rows="2"
              class="w-full border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
              placeholder="Zadejte vlastní kontext…"
            />
          </div>
          <button
            :disabled="pipeline.executingStep !== null"
            class="w-full bg-primary text-white px-4 py-1.5 rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
            @click="handleGenerate"
          >
            <svg v-if="pipeline.executingStep === STEP_KEY" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ pipeline.executingStep === STEP_KEY ? 'Generuji…' : 'Generovat' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Subject + To fields -->
    <div v-if="workspace.selectedPartner.value" class="border-b border-gray-100 px-4 py-2">
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-medium text-gray-400 shrink-0 w-16">Předmět</label>
        <input
          v-model="workspace.emailSubject.value"
          type="text"
          class="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
          placeholder="Předmět e-mailu…"
        />
      </div>
      <div class="flex items-center gap-2 mt-1">
        <label class="text-[10px] font-medium text-gray-400 shrink-0 w-16">Komu</label>
        <input
          v-model="workspace.emailTo.value"
          type="email"
          class="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
          placeholder="E-mailová adresa příjemce…"
        />
      </div>
    </div>

    <!-- Editor area -->
    <div class="flex-1 p-4 min-h-0 overflow-y-auto">
      <RichTextEditor
        v-model="workspace.emailBody.value"
        placeholder="Vygenerovaný e-mail se zobrazí zde..."
        :default-font="defaultFont"
      />
    </div>

    <!-- Footer: saved info + action buttons -->
    <div class="border-t border-gray-100 px-4 py-2 flex items-center shrink-0">
      <!-- Left: saved by info -->
      <div class="flex-1 flex items-center gap-2 text-[10px] text-gray-400 min-w-0">
        <template v-if="savedInfo">
          <template v-if="savedInfo.sentAt">
            <svg class="w-3 h-3 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Odesláno {{ relativeTime(savedInfo.sentAt) }}</span>
            <span class="text-gray-300">·</span>
          </template>
          <span>Uložil/a {{ savedInfo.name }} {{ relativeTime(savedInfo.at) }}</span>
        </template>
      </div>

      <!-- Right: action buttons -->
      <div v-if="hasBody" class="flex items-center gap-1.5 shrink-0">
        <button
          :disabled="!canSave || actions.saving.value"
          class="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1"
          @click="actions.handleSaveAndClose()"
        >
          <svg v-if="actions.saving.value" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Uložit a zavřít
        </button>
        <button
          :disabled="!canSend || actions.saving.value || hasPendingSend"
          class="px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1 whitespace-nowrap"
          @click="actions.handleSaveAndSend()"
        >
          Ulož a odeslat
        </button>
      </div>
    </div>
  </div>
</template>
