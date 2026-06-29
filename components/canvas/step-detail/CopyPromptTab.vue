<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import type { Step3Candidate } from '~/composables/pipeline/types'

const o = inject(overlayKey)!
const pipeline = inject(pipelineRunKey) as PipelineRunContext
const { stepType } = o
const route = useRoute()
const runId = route.params.id as string

// ── Partner selector (PARTNER_PROFILING only) ─────────────────────────────────

const selectedCandidate = ref<Step3Candidate | null>(null)

const ppCandidates = computed<Step3Candidate[]>(() => {
  if (stepType.value !== 'PARTNER_PROFILING') return []
  return pipeline?.step3FilteredCandidates?.() ?? []
})

// ── Prompt text ───────────────────────────────────────────────────────────────

const promptText = computed(() => {
  if (!pipeline) return ''
  if (stepType.value === 'MARKET_SCANNING') {
    return pipeline.step1CopyPrompt?.('MARKET_SCANNING') ?? ''
  }
  if (stepType.value === 'PARTNER_PROFILING') {
    if (!selectedCandidate.value) return ''
    return pipeline.step3PartnerCopyPrompt?.('PARTNER_PROFILING', selectedCandidate.value) ?? ''
  }
  return ''
})

const copyKey = computed(() => `copytab-${stepType.value}-${selectedCandidate.value?.partnerId ?? ''}`)

const isCopied = computed(() => pipeline?.copiedPromptKey === copyKey.value)

async function copyPrompt() {
  if (!promptText.value) return
  await pipeline?.copyDeepResearchPrompt?.(copyKey.value, promptText.value)
}

// ── Import / paste ────────────────────────────────────────────────────────────

const pasteText = ref('')
const importing = ref(false)
const importError = ref('')
const aiFixing = ref(false)

async function handleImport() {
  if (!pasteText.value.trim()) return
  importing.value = true
  importError.value = ''
  try {
    await $fetch(`/api/pipeline/${runId}/steps/import-ai`, {
      method: 'POST',
      body: {
        stepType: stepType.value,
        systemPromptId: pipeline?.getConfig?.(stepType.value ?? '')?.systemPromptId || undefined,
        rawInputText: pasteText.value,
      },
    })
    pasteText.value = ''
    await pipeline?.refresh?.()
  } catch (err) {
    importError.value = err instanceof Error ? err.message : String(err)
  } finally {
    importing.value = false
  }
}

async function fixWithAi() {
  aiFixing.value = true
  try {
    await handleImport()
  } finally {
    aiFixing.value = false
  }
}

// ── MS items + selection ──────────────────────────────────────────────────────

const msStep = computed(() => {
  if (stepType.value !== 'MARKET_SCANNING') return null
  return pipeline?.getStepResult('MARKET_SCANNING') ?? null
})

const msItems = computed<Array<Record<string, unknown>>>(() => {
  const out = (msStep.value as any)?.outputData
  return Array.isArray(out) ? out : []
})

const msSelectedSet = computed<Set<string> | null>(() => {
  const sel = (msStep.value as any)?.selectionData
  return Array.isArray(sel) ? new Set(sel as string[]) : null
})

function isMsSelected(item: Record<string, unknown>): boolean {
  const name = String(item.name ?? item.nazev ?? '')
  return msSelectedSet.value ? msSelectedSet.value.has(name) : true
}

const selectedCount = computed(() => {
  if (!msItems.value.length) return 0
  return msSelectedSet.value ? msSelectedSet.value.size : msItems.value.length
})

const selectionSaving = ref(false)

async function toggleMsItem(item: Record<string, unknown>) {
  if (!msStep.value) return
  const name = String(item.name ?? item.nazev ?? '')
  let newSelection: string[] | null

  if (!msSelectedSet.value) {
    // All selected → deselect this one
    newSelection = msItems.value.map(i => String(i.name ?? i.nazev ?? '')).filter(n => n !== name)
  } else {
    const s = new Set(msSelectedSet.value)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    newSelection = s.size === msItems.value.length ? null : [...s]
  }

  selectionSaving.value = true
  try {
    await $fetch(`/api/pipeline/${runId}/steps/${(msStep.value as any).id}/selection`, {
      method: 'PATCH',
      body: { selectedNames: newSelection },
    })
    await pipeline?.refresh?.()
  } finally {
    selectionSaving.value = false
  }
}

async function selectAllMs() {
  if (!msStep.value) return
  selectionSaving.value = true
  try {
    await $fetch(`/api/pipeline/${runId}/steps/${(msStep.value as any).id}/selection`, {
      method: 'PATCH',
      body: { selectedNames: null },
    })
    await pipeline?.refresh?.()
  } finally {
    selectionSaving.value = false
  }
}

// ── PP profiles list ──────────────────────────────────────────────────────────

const ppProfiles = computed<Array<Record<string, unknown>>>(() => {
  if (stepType.value !== 'PARTNER_PROFILING') return []
  const step = (pipeline?.run as any)?.steps?.findLast?.((s: any) => s.stepType === 'PARTNER_PROFILING')
  const out = (step as any)?.outputData
  return Array.isArray(out) ? out : []
})
</script>

<template>
  <div class="p-5 space-y-6">

    <!-- ── Partner selector (PP only) ── -->
    <div v-if="stepType === 'PARTNER_PROFILING'" class="space-y-1.5">
      <p class="text-xs font-medium text-gray-500">Partner k profilování</p>
      <select
        class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
        :value="selectedCandidate?.partnerId ?? ''"
        @change="selectedCandidate = ppCandidates.find(c => c.partnerId === ($event.target as HTMLSelectElement).value) ?? null"
      >
        <option value="">— vyberte partnera —</option>
        <option v-for="c in ppCandidates" :key="c.partnerId" :value="c.partnerId">
          {{ c.name }}
          <template v-if="c.frequency > 1"> ({{ c.frequency }}×)</template>
        </option>
      </select>
      <p v-if="ppCandidates.length === 0" class="text-xs text-gray-400">Žádní partneři — nejprve spusťte Partner Identification.</p>
    </div>

    <!-- ── Copy prompt ── -->
    <div class="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base flex-shrink-0">📋</span>
          <p class="text-sm font-semibold text-amber-800 truncate">
            <template v-if="stepType === 'MARKET_SCANNING'">Prompt pro průzkum trhu</template>
            <template v-else-if="selectedCandidate">Prompt pro: {{ selectedCandidate.name }}</template>
            <template v-else>Vyberte partnera výše</template>
          </p>
        </div>
        <button
          :disabled="!promptText"
          :class="[
            'text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0',
            isCopied ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40',
          ]"
          @click="copyPrompt"
        >
          {{ isCopied ? '✓ Zkopírováno!' : 'Kopírovat prompt' }}
        </button>
      </div>

      <pre
        v-if="promptText"
        class="text-xs text-amber-900 bg-amber-100 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words font-mono leading-relaxed"
      >{{ promptText }}</pre>

      <p class="text-xs text-amber-700">
        <template v-if="stepType === 'MARKET_SCANNING'">
          Zkopírujte do <strong>ChatGPT</strong> / <strong>Claude</strong> nebo AI s přístupem k internetu. Výsledek vložte níže.
        </template>
        <template v-else>
          Pro každého partnera zvlášť spusťte průzkum v AI s přístupem k webu. Výsledek vložte níže.
        </template>
      </p>
    </div>

    <!-- ── Paste + import ── -->
    <div class="space-y-2">
      <p class="text-xs font-medium text-gray-500">Vložit výsledek z AI</p>
      <textarea
        v-model="pasteText"
        placeholder="Vložte JSON výsledek nebo volný text z AI..."
        class="w-full h-32 text-xs border border-gray-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:border-indigo-300 font-mono"
      />
      <div class="flex items-center gap-2">
        <button
          :disabled="!pasteText.trim() || importing"
          class="text-sm font-medium px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          @click="handleImport"
        >
          {{ importing && !aiFixing ? 'Importuji...' : 'Importovat' }}
        </button>
        <button
          v-if="importError"
          :disabled="aiFixing"
          class="text-sm font-medium px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          @click="fixWithAi"
        >
          {{ aiFixing ? 'Opravuji...' : 'Opravit pomocí AI' }}
        </button>
      </div>
      <p v-if="importError" class="text-xs text-red-600 bg-red-50 rounded p-2 break-words">{{ importError }}</p>
    </div>

    <!-- ── MS: competition list with selection ── -->
    <div v-if="stepType === 'MARKET_SCANNING' && msItems.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-xs font-medium text-gray-500">Soutěže ({{ selectedCount }}/{{ msItems.length }} vybrány)</p>
        <button
          v-if="msSelectedSet !== null"
          :disabled="selectionSaving"
          class="text-xs text-indigo-500 hover:underline disabled:opacity-40"
          @click="selectAllMs"
        >Vybrat vše</button>
      </div>
      <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
        <label
          v-for="(item, idx) in msItems"
          :key="idx"
          class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
        >
          <input
            type="checkbox"
            :checked="isMsSelected(item)"
            :disabled="selectionSaving"
            class="rounded text-indigo-600 cursor-pointer"
            @change="toggleMsItem(item)"
          />
          <span class="flex-1 text-xs text-gray-800 truncate">{{ item.name || item.nazev }}</span>
          <span v-if="item.organizer" class="text-xs text-gray-400 truncate max-w-28">{{ item.organizer }}</span>
          <span
            v-if="item.status || item.stav"
            :class="[
              'text-xs px-1.5 py-0.5 rounded flex-shrink-0',
              ['aktivní', 'active'].includes(String(item.status ?? item.stav ?? '').toLowerCase())
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-400',
            ]"
          >{{ item.status || item.stav }}</span>
        </label>
      </div>
    </div>

    <!-- ── PP: profiles list ── -->
    <div v-else-if="stepType === 'PARTNER_PROFILING' && ppProfiles.length > 0" class="space-y-2">
      <p class="text-xs font-medium text-gray-500">Profilovaní partneři ({{ ppProfiles.length }})</p>
      <div class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
        <div v-for="(p, i) in ppProfiles" :key="i" class="px-3 py-2.5 flex items-center gap-3">
          <button
            class="text-xs text-gray-800 font-medium text-left hover:text-indigo-600 transition-colors"
            @click="selectedCandidate = ppCandidates.find(c => c.name === String(p.name ?? '')) ?? null"
          >{{ p.name }}</button>
          <span v-if="p.industry" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ p.industry }}</span>
          <span v-if="p.summary" class="text-xs text-green-600 ml-auto flex-shrink-0">✓ Hotovo</span>
          <span v-else class="text-xs text-gray-400 ml-auto flex-shrink-0">Částečný</span>
        </div>
      </div>
    </div>

  </div>
</template>
