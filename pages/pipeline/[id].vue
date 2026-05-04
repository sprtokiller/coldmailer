<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const { data: run, refresh } = await useFetch(`/api/pipeline/${route.params.id}`)

const STEP_MODEL_MAP: Record<string, string> = {
  MARKET_SCANNING:       'openai/o4-mini-deep-research',
  PARTNER_IDENTIFICATION: 'pipeline',
  PARTNER_PROFILING:     'openai/o4-mini-deep-research',
  CONTACT_DISCOVERY:     'openai/o4-mini-deep-research',
  VALUE_ALIGNMENT:       'anthropic/claude-sonnet-4-5',
  OUTREACH_PREPARATION:  'anthropic/claude-sonnet-4-5',
  OUTREACH_EXECUTION:    'gmail',
}

const STEPS = [
  { key: 'MARKET_SCANNING',        label: 'Market Scanning',        description: 'Find relevant high school competitions, events, and channels.' },
  { key: 'PARTNER_IDENTIFICATION',  label: 'Partner Identification',  description: 'SerpAPI + Playwright + AI – iterates each market item to find partners.' },
  { key: 'PARTNER_PROFILING',      label: 'Partner Profiling',      description: 'Deep-dive research on a specific partner.' },
  { key: 'CONTACT_DISCOVERY',      label: 'Contact Discovery',      description: 'Find the right person to reach out to.' },
  { key: 'VALUE_ALIGNMENT',        label: 'Value Alignment',        description: 'Rank selling points by relevance to this partner.' },
  { key: 'OUTREACH_PREPARATION',   label: 'Outreach Preparation',   description: 'Generate a tailored email draft.' },
  { key: 'OUTREACH_EXECUTION',     label: 'Outreach Execution',     description: 'Create draft directly in Gmail.' },
] as const

type StepKey = typeof STEPS[number]['key']
type PromptOption = {
  id: string
  name: string
  content: string
  stepType: string
  author: { name: string }
}

const { data: prompts } = await useFetch('/api/library/prompts', { default: () => [] })
const { data: contextParts } = await useFetch('/api/library/context-parts', { default: () => [] })
const { data: sellingPoints } = await useFetch('/api/library/selling-points', { default: () => [] })

const activeStep = ref<string | null>(null)
const executingStep = ref<string | null>(null)
const streamOutputs = ref<Record<string, string>>({})

const editingOutputStep = ref<string | null>(null)
const editingOutputDraft = ref('')
const confirmingOutputStep = ref<string | null>(null)
const savingOutput = ref(false)

function startEditOutput(stepKey: string) {
  const result = getStepResult(stepKey)
  editingOutputDraft.value = JSON.stringify(result?.outputData ?? {}, null, 2)
  editingOutputStep.value = stepKey
  confirmingOutputStep.value = null
}

function cancelEditOutput() {
  editingOutputStep.value = null
  confirmingOutputStep.value = null
}

function requestSaveOutput(stepKey: string) {
  try {
    JSON.parse(editingOutputDraft.value)
  } catch {
    alert('Neplatný JSON – opravte ho před uložením.')
    return
  }
  confirmingOutputStep.value = stepKey
}

async function confirmSaveOutput(stepKey: string) {
  const result = getStepResult(stepKey)
  if (!result) return
  savingOutput.value = true
  try {
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: JSON.parse(editingOutputDraft.value) },
    })
    await refresh()
    editingOutputStep.value = null
    confirmingOutputStep.value = null
  } finally {
    savingOutput.value = false
  }
}

const stepConfig = ref<Record<string, {
  systemPromptId: string
  contextPartIds: string[]
  sellingPointId: string
  inputData: string
}>>({})

function getConfig(stepKey: string) {
  if (!stepConfig.value[stepKey]) {
    // Pre-select the prompt that was last successfully used for this step type in this run.
    const lastSuccessful = run.value?.steps
      .filter((s: { stepType: string; status: string; systemPromptId: string | null }) =>
        s.stepType === stepKey && s.status === 'COMPLETED' && s.systemPromptId)
      .at(-1)
    stepConfig.value[stepKey] = {
      systemPromptId: lastSuccessful?.systemPromptId ?? '',
      contextPartIds: [],
      sellingPointId: '',
      inputData: '{}',
    }
  }
  return stepConfig.value[stepKey]
}

// Partner Identification progress
const partnerProgress = ref<Record<string, Array<{
  index: number; total: number; itemName: string; searchTerm?: string
  serpResults?: number; pagesLoaded?: number; partnersFound?: number
  status: 'processing' | 'done' | 'error'; error?: string
}>>>({})

// ── Step 3 – Partner Profiling ────────────────────────────────────────────────
interface Step3Candidate {
  partnerId: string
  name: string
  frequency: number
  itemNames: string[]
}

const step3SelectedIds = ref<Record<string, boolean>>({})
const step3FreqFilter  = ref(1)
const step3Initialized = ref(false)

const profilingProgress = ref<Record<string, Array<{
  index: number; total: number; name: string
  status: 'processing' | 'done' | 'error'; error?: string
  profile?: Record<string, unknown>
}>>>({})

const expandedProfileName = ref<string | null>(null)

function step3Candidates(): Step3Candidate[] {
  const items = partnerItems('PARTNER_IDENTIFICATION')
  const map = new Map<string, Step3Candidate>()
  for (const item of items) {
    for (const p of (item.partners ?? []) as Array<{ partnerId: string; name: string }>) {
      if (!p.partnerId) continue
      if (map.has(p.partnerId)) {
        const s = map.get(p.partnerId)!
        s.frequency++
        s.itemNames.push(item.itemName)
      } else {
        map.set(p.partnerId, { partnerId: p.partnerId, name: p.name, frequency: 1, itemNames: [item.itemName] })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.frequency - a.frequency)
}

function initStep3Selection() {
  if (step3Initialized.value) return
  const sel: Record<string, boolean> = {}
  for (const c of step3Candidates()) sel[c.partnerId] = true
  step3SelectedIds.value = sel
  step3Initialized.value = true
}

function step3SelectAll() {
  const sel = { ...step3SelectedIds.value }
  for (const c of step3Candidates()) {
    if (c.frequency >= step3FreqFilter.value) sel[c.partnerId] = true
  }
  step3SelectedIds.value = sel
}

function step3DeselectAll() {
  const sel = { ...step3SelectedIds.value }
  for (const c of step3Candidates()) sel[c.partnerId] = false
  step3SelectedIds.value = sel
}

function step3FilteredCandidates() {
  return step3Candidates().filter(c => c.frequency >= step3FreqFilter.value)
}

function step3SelectedCount() {
  return step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId]).length
}

function updateProfilingItem(stepKey: string, item: (typeof profilingProgress.value)[string][number]) {
  if (!profilingProgress.value[stepKey]) profilingProgress.value[stepKey] = []
  const idx = profilingProgress.value[stepKey].findIndex(i => i.index === item.index)
  if (idx >= 0) profilingProgress.value[stepKey][idx] = item
  else profilingProgress.value[stepKey].push(item)
}

function profilingOutputProfiles(stepKey: string): Array<Record<string, unknown>> {
  const data = getStepResult(stepKey)?.outputData
  if (!Array.isArray(data)) return []
  return data as Array<Record<string, unknown>>
}

watch(activeStep, (val) => {
  if (val === 'PARTNER_PROFILING') initStep3Selection()
})

function updatePartnerItem(stepKey: string, item: (typeof partnerProgress.value)[string][number]) {
  if (!partnerProgress.value[stepKey]) partnerProgress.value[stepKey] = []
  const idx = partnerProgress.value[stepKey].findIndex(i => i.index === item.index)
  if (idx >= 0) partnerProgress.value[stepKey][idx] = item
  else partnerProgress.value[stepKey].push(item)
}

function getStepResult(stepKey: string) {
  return run.value?.steps.findLast((s: { stepType: string }) => s.stepType === stepKey)
}

function promptsForStep(stepKey: StepKey) {
  return (prompts.value as PromptOption[]).filter((p) => p.stepType === stepKey)
}

function stepResultStatus(stepKey: StepKey) {
  return getStepResult(stepKey)?.status
}

function stepResultRunnerName(stepKey: StepKey) {
  return getStepResult(stepKey)?.runner?.name ?? ''
}

function stepResultPromptName(stepKey: StepKey) {
  return getStepResult(stepKey)?.systemPrompt?.name
}

function stepResultOutput(stepKey: StepKey) {
  const result = getStepResult(stepKey)
  return JSON.stringify(result?.outputData ?? result?.errorMessage, null, 2)
}

async function executeStep(stepKey: string) {
  const cfg = getConfig(stepKey)
  let inputData: Record<string, unknown> = {}

  if (stepKey === 'PARTNER_PROFILING') {
    // Build from partner picker instead of JSON textarea
    const selected = step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId])
    if (selected.length === 0) {
      alert('Vyberte alespoň jednoho partnera k prozkoumání.')
      return
    }
    inputData = { partners: selected }
  } else {
    try { inputData = JSON.parse(cfg.inputData || '{}') } catch {}
  }

  executingStep.value = stepKey
  streamOutputs.value[stepKey] = ''
  partnerProgress.value[stepKey] = []
  profilingProgress.value[stepKey] = []

  let response: Response
  try {
    response = await fetch(`/api/pipeline/${route.params.id}/steps/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepType: stepKey,
        systemPromptId: cfg.systemPromptId || undefined,
        contextPartIds: cfg.contextPartIds.length ? cfg.contextPartIds : undefined,
        sellingPointId: cfg.sellingPointId || undefined,

        inputData,
      }),
    })
  } catch (e) {
    executingStep.value = null
    alert('Network error — could not reach the server.')
    return
  }

  if (!response.ok) {
    executingStep.value = null
    const text = await response.text().catch(() => response.statusText)
    alert(`Failed to start step: ${text}`)
    return
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.chunk !== undefined) {
            streamOutputs.value[stepKey] = (streamOutputs.value[stepKey] ?? '') + data.chunk
          }
          if (data.partnerItem) {
            updatePartnerItem(stepKey, data.partnerItem)
          }
          if (data.profilingItem) {
            updateProfilingItem(stepKey, data.profilingItem)
          }
          if (data.error) {
            alert(`Step failed: ${data.error}`)
          }
          if (data.done) {
            await refresh()
          }
        } catch {}
      }
    }
  } finally {
    executingStep.value = null
  }
}

function prevStepOutput(stepKey: string): string {
  const idx = STEPS.findIndex((s) => s.key === stepKey)
  if (idx <= 0) return '{}'
  const prevKey = STEPS[idx - 1].key
  const prevStep = getStepResult(prevKey)
  return prevStep?.outputData ? JSON.stringify(prevStep.outputData, null, 2) : '{}'
}

const promptPreviewStep = ref<string | null>(null)

// ── Output view mode ─────────────────────────────────────────────────────────
// For generic steps: 'table' | 'raw'
// For PARTNER_IDENTIFICATION: 'raw' | 'item' | 'candidates'
const outputViewMode = ref<Record<string, string>>({})

function getOutputMode(stepKey: string, defaultMode = 'table') {
  return outputViewMode.value[stepKey] ?? defaultMode
}

function setOutputMode(stepKey: string, mode: string) {
  outputViewMode.value[stepKey] = mode
}

/** Returns the outputData as a JSON array if valid, otherwise null. */
function asJsonArray(stepKey: string): Record<string, unknown>[] | null {
  const data = getStepResult(stepKey)?.outputData
  if (!Array.isArray(data) || data.length === 0) return null
  if (typeof data[0] !== 'object' || data[0] === null) return null
  return data as Record<string, unknown>[]
}

/** Dynamic column keys from the first object of a JSON array. */
function tableColumns(arr: Record<string, unknown>[]): string[] {
  return Object.keys(arr[0] ?? {})
}

// ── Partner Identification result helpers ─────────────────────────────────────
interface PartnerResultItem {
  itemName: string
  searchTerm?: string
  serpResults?: number
  pagesLoaded?: number
  partners?: Array<{ partnerId: string; name: string; isNew: boolean }>
  error?: string
}

function partnerItems(stepKey: string): PartnerResultItem[] {
  const data = getStepResult(stepKey)?.outputData as { items?: PartnerResultItem[] } | undefined
  return data?.items ?? []
}

interface CandidateSummary {
  name: string
  itemCount: number
  itemNames: string[]
}

function candidateList(stepKey: string): CandidateSummary[] {
  const items = partnerItems(stepKey)
  const map = new Map<string, CandidateSummary>()
  for (const item of items) {
    for (const p of item.partners ?? []) {
      const key = p.name.toLowerCase().trim()
      if (map.has(key)) {
        const s = map.get(key)!
        s.itemCount++
        s.itemNames.push(item.itemName)
      } else {
        map.set(key, { name: p.name, itemCount: 1, itemNames: [item.itemName] })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.itemCount - a.itemCount)
}

const candidateHoverIdx = ref<number | null>(null)

function selectedPrompt(stepKey: string) {
  const id = getConfig(stepKey).systemPromptId
  if (!id) return null
  return (prompts.value as Array<{ id: string; name: string; content: string; author: { name: string } }>)
    .find(p => p.id === id) ?? null
}

const MODEL_BADGE: Record<string, { label: string; cls: string }> = {
  'openai/o4-mini-deep-research':  { label: 'o4-mini deep research', cls: 'bg-primary/10 text-primary' },
  'anthropic/claude-sonnet-4-5': { label: 'Claude Sonnet (latest)', cls: 'bg-success/10 text-success' },
  'gmail':    { label: 'Gmail API', cls: 'bg-danger/10 text-danger' },
  'pipeline': { label: 'SerpAPI + Playwright + AI', cls: 'bg-violet-100 text-violet-700' },
}

function modelBadge(stepKey: string) {
  return MODEL_BADGE[STEP_MODEL_MAP[stepKey] ?? ''] ?? { label: stepKey, cls: 'bg-gray-100 text-gray-500' }
}
</script>

<template>
  <div v-if="run">
    <div class="mb-8">
      <NuxtLink to="/" class="text-sm text-gray-400 hover:text-gray-600 transition-colors">← Pipelines</NuxtLink>
      <h1 class="text-2xl font-semibold text-gray-800 mt-2">{{ run.name }}</h1>
      <p class="text-sm text-gray-400 mt-1">by {{ run.author.name }} · {{ new Date(run.createdAt).toLocaleDateString('en-US') }}</p>
    </div>

    <div class="space-y-3">
      <div
        v-for="(step, idx) in STEPS"
        :key="step.key"
        class="bg-white rounded-xl border transition-all"
        :class="activeStep === step.key ? 'border-primary/50 shadow-md' : 'border-gray-100'"
      >
        <!-- Header row -->
        <button
          class="w-full flex items-center gap-4 p-5 text-left"
          @click="activeStep = activeStep === step.key ? null : step.key"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
            :class="getStepResult(step.key)?.status === 'COMPLETED'
              ? 'bg-success text-white'
              : getStepResult(step.key)?.status === 'FAILED'
              ? 'bg-danger text-white'
              : executingStep === step.key
              ? 'bg-primary text-white animate-pulse'
              : 'bg-gray-100 text-gray-400'"
          >
            <svg v-if="getStepResult(step.key)?.status === 'COMPLETED'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="getStepResult(step.key)?.status === 'FAILED'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span v-else>{{ idx + 1 }}</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-medium text-gray-800">{{ step.label }}</p>
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="modelBadge(step.key).cls"
              >
                {{ modelBadge(step.key).label }}
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">{{ step.description }}</p>
          </div>

          <svg
            class="w-4 h-4 text-gray-300 shrink-0 transition-transform"
            :class="activeStep === step.key ? 'rotate-180' : ''"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Expanded config + output -->
        <div v-if="activeStep === step.key" class="px-5 pb-5 border-t border-gray-50">
          <div class="pt-4 space-y-4">

            <!-- System prompt picker -->
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">System Strategy Prompt</label>
              <div class="flex items-center gap-2">
                <select
                  v-model="getConfig(step.key).systemPromptId"
                  class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Default prompt</option>
                  <option
                  v-for="p in promptsForStep(step.key)"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }} · {{ p.author.name }}
                  </option>
                </select>

                <!-- Prompt preview trigger -->
                <div
                  v-if="selectedPrompt(step.key)"
                  class="relative shrink-0"
                  @mouseenter="promptPreviewStep = step.key"
                  @mouseleave="promptPreviewStep = null"
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

                  <!-- Popover -->
                  <div
                    v-if="promptPreviewStep === step.key"
                    class="absolute right-0 top-full mt-1 z-50 w-96 bg-white rounded-xl border border-gray-200 shadow-xl p-4"
                  >
                    <div class="flex items-start justify-between mb-3">
                      <div class="min-w-0">
                        <p class="font-medium text-gray-800 text-sm truncate">{{ selectedPrompt(step.key)?.name }}</p>
                        <p class="text-xs text-gray-400 mt-0.5">by {{ selectedPrompt(step.key)?.author?.name }}</p>
                      </div>
                      <a
                        href="/library"
                        target="_blank"
                        class="shrink-0 ml-3 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors font-medium whitespace-nowrap"
                      >
                        Edit in Library →
                      </a>
                    </div>
                    <pre class="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">{{ selectedPrompt(step.key)?.content }}</pre>
                  </div>
                </div>
              </div>
            </div>

            <!-- Context parts -->
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Context Parts</label>
              <div v-if="contextParts.length" class="space-y-1 max-h-32 overflow-y-auto">
                <label
                  v-for="cp in contextParts"
                  :key="cp.id"
                  class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :value="cp.id"
                    v-model="getConfig(step.key).contextPartIds"
                    class="accent-primary"
                  />
                  {{ cp.name }}
                </label>
              </div>
              <p v-else class="text-xs text-gray-400">No context parts in library yet.</p>
            </div>

            <!-- Selling point (Value Alignment only) -->
            <div v-if="step.key === 'VALUE_ALIGNMENT'">
              <label class="block text-xs font-medium text-gray-500 mb-1">Selling Point</label>
              <select
                v-model="getConfig(step.key).sellingPointId"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">None</option>
                <option v-for="sp in sellingPoints" :key="sp.id" :value="sp.id">
                  {{ sp.name }}
                </option>
              </select>
            </div>


            <!-- Partner Profiling – partner picker (replaces generic input data) -->
            <div v-if="step.key === 'PARTNER_PROFILING'">
              <div v-if="step3Candidates().length === 0" class="text-xs text-gray-400 py-2">
                Nejprve spusťte Krok 2 (Partner Identification), abyste získali kandidáty.
              </div>
              <template v-else>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-xs font-medium text-gray-500">
                    Kandidáti z Kroku 2
                    <span class="ml-1 font-normal text-gray-400">({{ step3SelectedCount() }} / {{ step3FilteredCandidates().length }} vybráno)</span>
                  </label>
                  <div class="flex items-center gap-3">
                    <label class="flex items-center gap-1.5 text-xs text-gray-500">
                      Min. výskytů:
                      <input v-model.number="step3FreqFilter" type="number" min="1" :max="step3Candidates()[0]?.frequency ?? 1"
                        class="w-12 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/30" />
                    </label>
                    <button type="button" class="text-xs text-primary hover:underline" @click="step3SelectAll()">Vše</button>
                    <button type="button" class="text-xs text-gray-400 hover:underline" @click="step3DeselectAll()">Žádné</button>
                  </div>
                </div>
                <div class="rounded-lg border border-gray-100 overflow-hidden text-xs max-h-56 overflow-y-auto">
                  <div class="grid grid-cols-[1.5rem_1fr_4rem_1fr] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                    <span></span><span>Partner</span><span class="text-center">Výskytů</span><span>Nalezen v</span>
                  </div>
                  <label
                    v-for="c in step3FilteredCandidates()"
                    :key="c.partnerId"
                    class="grid grid-cols-[1.5rem_1fr_4rem_1fr] px-3 py-1.5 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
                    :class="step3SelectedIds[c.partnerId] ? '' : 'opacity-50'"
                  >
                    <input type="checkbox" v-model="step3SelectedIds[c.partnerId]" class="accent-primary" />
                    <span class="font-medium text-gray-700 truncate" :title="c.name">{{ c.name }}</span>
                    <span class="text-center font-semibold" :class="c.frequency > 1 ? 'text-primary' : 'text-gray-400'">{{ c.frequency }}×</span>
                    <span class="text-gray-400 truncate text-[10px]" :title="c.itemNames.join(', ')">{{ c.itemNames.join(', ') }}</span>
                  </label>
                </div>
              </template>
            </div>

            <!-- Input data (hidden for step 1 — it needs no input, and for PARTNER_PROFILING which uses picker above) -->
            <div v-if="idx > 0 && step.key !== 'PARTNER_PROFILING'">
              <label class="block text-xs font-medium text-gray-500 mb-1">
                Input Data (JSON)
                <button
                  type="button"
                  class="ml-2 text-primary hover:underline"
                  @click="getConfig(step.key).inputData = prevStepOutput(step.key)"
                >
                  ← fill from previous step
                </button>
              </label>
              <textarea
                v-model="getConfig(step.key).inputData"
                rows="4"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="{}"
              />
            </div>

            <!-- Run button -->
            <button
              :disabled="executingStep !== null"
              class="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
              @click="executeStep(step.key)"
            >
              <svg v-if="executingStep === step.key" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ executingStep === step.key ? 'Running…' : 'Run Step' }}
            </button>

            <!-- Live stream output -->
            <div v-if="executingStep === step.key && streamOutputs[step.key]">
              <p class="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                Live output
              </p>
              <pre class="bg-gray-50 border border-primary/20 rounded-lg p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">{{ streamOutputs[step.key] }}</pre>
            </div>

            <!-- Partner Profiling – per-partner progress table -->
            <div v-if="step.key === 'PARTNER_PROFILING' && profilingProgress[step.key]?.length" class="mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">Průběh profilování</p>
              <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
                <div class="grid grid-cols-[2rem_1fr_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                  <span>#</span><span>Partner</span><span class="text-center">Status</span>
                </div>
                <div
                  v-for="pi in profilingProgress[step.key]"
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

            <!-- Partner Identification – per-item progress table -->
            <div v-if="step.key === 'PARTNER_IDENTIFICATION' && partnerProgress[step.key]?.length" class="mt-2">
              <p class="text-xs font-medium text-gray-500 mb-2">Progress položek</p>
              <div class="rounded-lg border border-gray-100 overflow-hidden text-xs">
                <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                  <span>#</span><span>Položka</span><span>Search term</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span><span class="text-center">Status</span>
                </div>
                <div
                  v-for="pi in partnerProgress[step.key]"
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

            <!-- Saved result -->
            <div v-if="getStepResult(step.key)" class="mt-1">
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-medium text-gray-500">
                  Saved result ·
                  <span :class="stepResultStatus(step.key) === 'COMPLETED' ? 'text-success' : 'text-danger'">
                    {{ stepResultStatus(step.key) }}
                  </span>
                  · by {{ stepResultRunnerName(step.key) }}
                  <span v-if="stepResultPromptName(step.key)" class="ml-1 text-gray-400">
                    · {{ stepResultPromptName(step.key) }}
                  </span>
                </p>
                <button
                  v-if="editingOutputStep !== step.key"
                  class="text-xs text-gray-400 hover:text-primary transition-colors ml-3 shrink-0"
                  @click="startEditOutput(step.key)"
                >
                  Edit output
                </button>
              </div>

              <!-- Confirmation banner -->
              <div
                v-if="confirmingOutputStep === step.key"
                class="mb-2 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs"
              >
                <span class="flex-1 text-amber-800">Opravdu přepsat uložený výstup? Tato akce je nevratná.</span>
                <button
                  class="font-medium text-danger hover:underline disabled:opacity-50"
                  :disabled="savingOutput"
                  @click="confirmSaveOutput(step.key)"
                >
                  {{ savingOutput ? 'Ukládám…' : 'Potvrdit' }}
                </button>
                <button class="text-gray-500 hover:underline" @click="confirmingOutputStep = null">Zrušit</button>
              </div>

              <!-- Editable textarea -->
              <template v-if="editingOutputStep === step.key">
                <textarea
                  v-model="editingOutputDraft"
                  rows="10"
                  class="w-full border border-primary/40 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                />
                <div class="flex gap-2 mt-2">
                  <button
                    class="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                    @click="requestSaveOutput(step.key)"
                  >
                    Save
                  </button>
                  <button class="text-xs text-gray-400 hover:text-gray-600 px-3" @click="cancelEditOutput()">
                    Cancel
                  </button>
                </div>
              </template>

              <!-- Read-only view – PARTNER_PROFILING: expandable table -->
              <template v-else-if="step.key === 'PARTNER_PROFILING'">
                <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
                  <button v-for="m in [['table','Table'],['raw','Raw']]" :key="m[0]"
                    class="px-3 py-1 rounded-lg font-medium transition-all"
                    :class="getOutputMode(step.key,'table')===m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                    @click="setOutputMode(step.key, m[0])">{{ m[1] }}</button>
                </div>

                <pre v-if="getOutputMode(step.key,'table')==='raw'" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ stepResultOutput(step.key) }}</pre>

                <div v-else class="rounded-lg border border-gray-100 overflow-hidden text-xs">
                  <!-- Header -->
                  <div class="grid grid-cols-[1fr_8rem_6rem_1fr_4rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                    <span>Partner</span><span>Odvětví</span><span>Hiring</span><span>Minulá spolupráce</span><span class="text-center">Detail</span>
                  </div>
                  <!-- Rows -->
                  <template v-for="(profile, pi) in profilingOutputProfiles(step.key)" :key="pi">
                    <div
                      class="grid grid-cols-[1fr_8rem_6rem_1fr_4rem] px-3 py-2 gap-2 border-t border-gray-50 items-center cursor-pointer hover:bg-gray-50/60"
                      :class="profile.error ? 'bg-red-50' : ''"
                      @click="expandedProfileName = expandedProfileName === profile.name ? null : String(profile.name ?? '')"
                    >
                      <span class="font-medium text-gray-800 truncate" :title="String(profile.name ?? '')">{{ profile.name }}</span>
                      <span class="text-gray-500 truncate text-[11px]" :title="String(profile.industry ?? '')">{{ profile.industry ?? '–' }}</span>
                      <span class="text-[11px] truncate" :title="String(profile.hiringStatus ?? '')">
                        <span v-if="profile.hiringStatus" class="text-gray-600">{{ String(profile.hiringStatus).slice(0, 30) }}{{ String(profile.hiringStatus).length > 30 ? '…' : '' }}</span>
                        <span v-else class="text-gray-400">–</span>
                      </span>
                      <span class="text-[10px] text-gray-500 truncate" :title="Array.isArray(profile.pastCollaborations) ? (profile.pastCollaborations as string[]).join(', ') : ''">
                        {{ Array.isArray(profile.pastCollaborations) && (profile.pastCollaborations as string[]).length
                            ? (profile.pastCollaborations as string[]).join(', ')
                            : (profile.error ? '⚠ error' : '–') }}
                      </span>
                      <span class="text-center text-primary text-[11px]">{{ expandedProfileName === profile.name ? '▲' : '▼' }}</span>
                    </div>

                    <!-- Expanded detail -->
                    <div v-if="expandedProfileName === String(profile.name ?? '')" class="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 space-y-3 text-xs">
                      <div v-if="profile.error" class="text-danger">{{ profile.error }}</div>
                      <template v-else>
                        <!-- Summary -->
                        <div v-if="profile.summary">
                          <p class="font-medium text-gray-600 mb-0.5">Summary</p>
                          <p class="text-gray-700 leading-relaxed">{{ profile.summary }}</p>
                        </div>
                        <!-- Activities -->
                        <div v-if="profile.activities">
                          <p class="font-medium text-gray-600 mb-0.5">Aktivity</p>
                          <p class="text-gray-600 leading-relaxed">{{ profile.activities }}</p>
                        </div>
                        <!-- Hiring status -->
                        <div v-if="profile.hiringStatus">
                          <p class="font-medium text-gray-600 mb-0.5">Nábor zaměstnanců</p>
                          <p class="text-gray-600">{{ profile.hiringStatus }}</p>
                        </div>
                        <!-- Past collaborations -->
                        <div v-if="Array.isArray(profile.pastCollaborations) && (profile.pastCollaborations as string[]).length">
                          <p class="font-medium text-gray-600 mb-1">Minulá spolupráce</p>
                          <ul class="space-y-0.5">
                            <li v-for="c in (profile.pastCollaborations as string[])" :key="c" class="text-gray-600">· {{ c }}</li>
                          </ul>
                        </div>
                      </template>
                    </div>
                  </template>
                  <div v-if="!profilingOutputProfiles(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádné profily.</div>
                </div>
              </template>

              <!-- Read-only view – PARTNER_IDENTIFICATION gets 3-mode tabs -->
              <template v-else-if="step.key === 'PARTNER_IDENTIFICATION'">
                <!-- Tab bar -->
                <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
                  <button v-for="m in [['item','Item-centric'],['candidates','Candidates'],['raw','Raw']]" :key="m[0]"
                    class="px-3 py-1 rounded-lg font-medium transition-all"
                    :class="getOutputMode(step.key,'item')===m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                    @click="setOutputMode(step.key, m[0])">{{ m[1] }}</button>
                </div>

                <!-- Item-centric table -->
                <div v-if="getOutputMode(step.key,'item')==='item'" class="rounded-lg border border-gray-100 overflow-hidden text-xs">
                  <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                    <span>#</span><span>Položka</span><span>Search term</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span>
                  </div>
                  <div v-for="(pi, idx) in partnerItems(step.key)" :key="idx"
                    class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center"
                    :class="pi.error ? 'bg-red-50' : 'bg-white'">
                    <span class="text-gray-400">{{ idx + 1 }}</span>
                    <span class="truncate font-medium text-gray-700" :title="pi.itemName">{{ pi.itemName }}</span>
                    <span class="truncate text-gray-400 text-[10px]" :title="pi.searchTerm">{{ pi.searchTerm ?? '…' }}</span>
                    <span class="text-center text-gray-500">{{ pi.serpResults ?? '–' }}</span>
                    <span class="text-center text-gray-500">{{ pi.pagesLoaded ?? '–' }}</span>
                    <span class="text-center font-semibold" :class="(pi.partners?.length ?? 0) > 0 ? 'text-success' : 'text-gray-400'">{{ pi.partners?.length ?? (pi.error ? '✗' : '–') }}</span>
                  </div>
                </div>

                <!-- Candidate list -->
                <div v-else-if="getOutputMode(step.key,'item')==='candidates'" class="rounded-lg border border-gray-100 overflow-hidden text-xs">
                  <div class="grid grid-cols-[1fr_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
                    <span>Kandidát</span><span class="text-center">Počet položek</span>
                  </div>
                  <div v-for="(c, ci) in candidateList(step.key)" :key="ci"
                    class="grid grid-cols-[1fr_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 bg-white items-center">
                    <span class="font-medium text-gray-700">{{ c.name }}</span>
                    <div class="relative text-center">
                      <span
                        class="cursor-default underline decoration-dotted text-gray-600 font-semibold"
                        @mouseenter="candidateHoverIdx = ci"
                        @mouseleave="candidateHoverIdx = null"
                      >{{ c.itemCount }}</span>
                      <div v-if="candidateHoverIdx === ci"
                        class="absolute right-0 bottom-full mb-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 text-left min-w-[14rem] max-w-xs">
                        <p class="font-medium text-gray-700 mb-1 text-[11px]">Položky ({{ c.itemCount }}):</p>
                        <ul class="space-y-0.5">
                          <li v-for="n in c.itemNames" :key="n" class="text-gray-500 truncate text-[11px]">· {{ n }}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div v-if="!candidateList(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádní kandidáti.</div>
                </div>

                <!-- Raw JSON -->
                <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ stepResultOutput(step.key) }}</pre>
              </template>

              <!-- Read-only view – generic steps: Table / Raw toggle -->
              <template v-else>
                <div v-if="asJsonArray(step.key)" class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
                  <button v-for="m in [['table','Table'],['raw','Raw']]" :key="m[0]"
                    class="px-3 py-1 rounded-lg font-medium transition-all"
                    :class="getOutputMode(step.key,'table')===m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                    @click="setOutputMode(step.key, m[0])">{{ m[1] }}</button>
                </div>

                <!-- Table view -->
                <div v-if="asJsonArray(step.key) && getOutputMode(step.key,'table')==='table'" class="overflow-x-auto rounded-lg border border-gray-100 text-xs max-h-64 overflow-y-auto">
                  <table class="w-full border-collapse">
                    <thead class="bg-gray-50 sticky top-0">
                      <tr>
                        <th v-for="col in tableColumns(asJsonArray(step.key)!)" :key="col"
                          class="text-left px-3 py-1.5 font-medium text-gray-400 border-b border-gray-100 whitespace-nowrap">{{ col }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in asJsonArray(step.key)" :key="ri" class="border-t border-gray-50 hover:bg-gray-50/60">
                        <td v-for="col in tableColumns(asJsonArray(step.key)!)" :key="col"
                          class="px-3 py-1.5 text-gray-600 align-top max-w-xs">
                          <span class="block truncate" :title="String(row[col] ?? '')">{{ typeof row[col] === 'object' ? JSON.stringify(row[col]) : (row[col] ?? '–') }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Raw JSON fallback -->
                <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ stepResultOutput(step.key) }}</pre>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
