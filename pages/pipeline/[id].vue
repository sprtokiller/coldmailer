<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const { data: run, refresh } = await useFetch(`/api/pipeline/${route.params.id}`)

const STEPS = [
  { key: 'MARKET_SCANNING',       label: 'Market Scanning',       model: 'o4-mini-deep-research', description: 'Find relevant high school competitions, events, and channels.' },
  { key: 'PARTNER_IDENTIFICATION', label: 'Partner Identification', model: 'pipeline', description: 'SerpAPI + Playwright + claude sonnet 4.6 – iterates each market item to find partners.' },
  { key: 'PARTNER_PROFILING',     label: 'Partner Profiling',     model: 'o4-mini-deep-research', description: 'Deep-dive research on a specific partner.' },
  { key: 'CONTACT_DISCOVERY',     label: 'Contact Discovery',     model: 'o4-mini-deep-research', description: 'Find the right person to reach out to.' },
  { key: 'VALUE_ALIGNMENT',       label: 'Value Alignment',       model: 'claude-sonnet-4.6', description: 'Rank selling points by relevance to this partner.' },
  { key: 'OUTREACH_PREPARATION',  label: 'Outreach Preparation',  model: 'claude-sonnet-4.6', description: 'Generate a tailored email draft.' },
  { key: 'OUTREACH_EXECUTION',    label: 'Outreach Execution',    model: 'gmail', description: 'Create draft directly in Gmail.' },
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
  searchTermExample: string
}>>({})

function getConfig(stepKey: string) {
  if (!stepConfig.value[stepKey]) {
    stepConfig.value[stepKey] = { systemPromptId: '', contextPartIds: [], sellingPointId: '', inputData: '{}', searchTermExample: '<název soutěže> partneři' }
  }
  return stepConfig.value[stepKey]
}

// Partner Identification progress
const partnerProgress = ref<Record<string, Array<{
  index: number; total: number; itemName: string; searchTerm?: string
  serpResults?: number; pagesLoaded?: number; partnersFound?: number
  status: 'processing' | 'done' | 'error'; error?: string
}>>>({})

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
  try { inputData = JSON.parse(cfg.inputData || '{}') } catch {}

  executingStep.value = stepKey
  streamOutputs.value[stepKey] = ''
  partnerProgress.value[stepKey] = []

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
        searchTermExample: stepKey === 'PARTNER_IDENTIFICATION' ? cfg.searchTermExample : undefined,
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

function selectedPrompt(stepKey: string) {
  const id = getConfig(stepKey).systemPromptId
  if (!id) return null
  return (prompts.value as Array<{ id: string; name: string; content: string; author: { name: string } }>)
    .find(p => p.id === id) ?? null
}

const MODEL_BADGE: Record<string, { label: string; cls: string }> = {
  'o4-mini-deep-research': { label: 'o4-mini deep research', cls: 'bg-primary/10 text-primary' },
  'claude-sonnet-4.6': { label: 'claude sonnet 4.6', cls: 'bg-success/10 text-success' },
  'gmail': { label: 'Gmail API', cls: 'bg-danger/10 text-danger' },
  'pipeline': { label: 'SerpAPI + Playwright + claude sonnet 4.6', cls: 'bg-violet-100 text-violet-700' },
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
                :class="MODEL_BADGE[step.model]?.cls"
              >
                {{ MODEL_BADGE[step.model]?.label }}
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

            <!-- Search term example (Partner Identification only) -->
            <div v-if="step.key === 'PARTNER_IDENTIFICATION'">
              <label class="block text-xs font-medium text-gray-500 mb-1">Search term example</label>
              <input
                v-model="getConfig(step.key).searchTermExample"
                type="text"
                placeholder="<název soutěže> partneři"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p class="text-xs text-gray-400 mt-1">claude sonnet 4.6 vygeneruje search query pro každou položku v tomto formátu.</p>
            </div>

            <!-- Input data (hidden for step 1 — it needs no input) -->
            <div v-if="idx > 0">
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

              <!-- Read-only view -->
              <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ stepResultOutput(step.key) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
