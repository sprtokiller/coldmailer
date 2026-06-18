<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderLinks(text: string | null | undefined): string {
  if (!text) return ''
  const escaped = escapeHtml(String(text))
  return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">$1</a>')
}

const selectedRows = ref<Set<number>>(new Set())
const tableRows = computed(() => pipeline.resolveTable(props.step.key)?.rows ?? [])
const allSelected = computed(() => tableRows.value.length > 0 && selectedRows.value.size === tableRows.value.length)
const someSelected = computed(() => selectedRows.value.size > 0 && selectedRows.value.size < tableRows.value.length)

const expandedItem = ref<string | null>(null)

const tableGridStyle = computed(() => {
  const t = pipeline.resolveTable(props.step.key)
  if (!t) return {}
  const n = pipeline.tableColumns(t.rows).length
  return { gridTemplateColumns: `1.5rem ${Array(n).fill('minmax(0,1fr)').join(' ')} 2rem` }
})

const tableGridStyleSimple = computed(() => {
  const t = pipeline.resolveTable(props.step.key)
  if (!t) return {}
  const n = pipeline.tableColumns(t.rows).length
  return { gridTemplateColumns: `${Array(n).fill('minmax(0,1fr)').join(' ')} 2rem` }
})

watch(() => tableRows.value.length, () => { selectedRows.value = new Set() })

function toggleSelectAll() {
  selectedRows.value = allSelected.value
    ? new Set()
    : new Set(tableRows.value.map((_, i) => i))
}

function toggleRow(i: number) {
  const next = new Set(selectedRows.value)
  next.has(i) ? next.delete(i) : next.add(i)
  selectedRows.value = next
}

async function deleteSelectedRows() {
  await pipeline.deleteTableRows(props.step.key, [...selectedRows.value])
  selectedRows.value = new Set()
}
</script>

<template>
  <div v-if="pipeline.getStepResult(step.key)" class="mt-1">
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs font-medium text-gray-500">
        Uložený výsledek ·
        <span :class="pipeline.stepResultStatus(step.key) === 'COMPLETED' ? 'text-success' : 'text-danger'">
          {{ pipeline.stepResultStatus(step.key) }}
        </span>
        · od {{ pipeline.stepResultRunnerName(step.key) }}
        <span v-if="pipeline.stepResultPromptName(step.key)" class="ml-1 text-gray-400">
          · {{ pipeline.stepResultPromptName(step.key) }}
        </span>
      </p>
      <button
        v-if="pipeline.editingOutputStep !== step.key"
        class="text-xs text-gray-400 hover:text-primary transition-colors ml-3 shrink-0"
        @click="pipeline.startEditOutput(step.key)"
      >
        Upravit výstup
      </button>
    </div>

    <div
      v-if="pipeline.confirmingOutputStep === step.key"
      class="mb-2 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs"
    >
      <span class="flex-1 text-amber-800">Opravdu přepsat uložený výstup? Tato akce je nevratná.</span>
      <button
        class="font-medium text-danger hover:underline disabled:opacity-50"
        :disabled="pipeline.savingOutput"
        @click="pipeline.confirmSaveOutput(step.key)"
      >
        {{ pipeline.savingOutput ? 'Ukládám…' : 'Potvrdit' }}
      </button>
      <button class="text-gray-500 hover:underline" @click="pipeline.confirmingOutputStep = null">Zrušit</button>
    </div>

    <template v-if="pipeline.editingOutputStep === step.key">
      <textarea
        v-model="pipeline.editingOutputDraft"
        rows="10"
        class="w-full border border-primary/40 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
      />
      <div class="flex gap-2 mt-2">
        <button
          class="bg-primary text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
          @click="pipeline.requestSaveOutput(step.key)"
        >
          Uložit
        </button>
        <button class="text-xs text-gray-400 hover:text-gray-600 px-3" @click="pipeline.cancelEditOutput()">
          Zrušit
        </button>
      </div>
    </template>

    <template v-else-if="step.key === 'PARTNER_PROFILING'">
      <div class="flex items-center justify-between mb-3">
        <div class="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit text-xs">
          <button
            v-for="m in [['table', 'Tabulka'], ['raw', 'Raw']]"
            :key="m[0]"
            class="px-3 py-1 rounded-lg font-medium transition-all"
            :class="pipeline.getOutputMode(step.key, 'table') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            @click="pipeline.setOutputMode(step.key, m[0])"
          >
            {{ m[1] }}
          </button>
        </div>
      </div>

      <pre v-if="pipeline.getOutputMode(step.key, 'table') === 'raw'" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>

      <div v-else class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[1fr_8rem_3rem_1fr_4rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2 items-center">
          <span>Partner</span><span>Odvětví</span><span class="text-center">Kontak.</span><span>Nejlepší kontakt</span><span class="text-center">Detail</span><span></span>
        </div>
        <template v-for="(profile, pi) in pipeline.profilingOutputProfiles(step.key)" :key="pi">
          <div
            class="grid grid-cols-[1fr_8rem_3rem_1fr_4rem_2rem] px-3 py-2 gap-2 border-t border-gray-50 items-center hover:bg-gray-50/60"
            :class="profile.error ? 'bg-red-50' : ''"
          >
            <span
              class="font-medium text-gray-800 truncate cursor-pointer"
              :title="String(profile.name ?? '')"
              @click="pipeline.expandedProfileName = pipeline.expandedProfileName === profile.name ? null : String(profile.name ?? '')"
            >
              {{ profile.name }}
            </span>
            <span class="text-gray-500 truncate text-[11px]" :title="String(profile.industry ?? '')">{{ profile.industry ?? '–' }}</span>
            <span class="text-center font-semibold text-[11px]" :class="Array.isArray(profile.contacts) && (profile.contacts as unknown[]).length ? 'text-success' : 'text-gray-400'">
              {{ Array.isArray(profile.contacts) ? (profile.contacts as unknown[]).length : (profile.error ? '⚠' : '–') }}
            </span>
            <span class="text-[11px] truncate text-gray-500">
              {{ (() => {
                const contacts = Array.isArray(profile.contacts) ? (profile.contacts as Record<string, unknown>[]).slice().sort((a, b) => Number(a.priority ?? 9) - Number(b.priority ?? 9)) : []
                const best = contacts[0]
                if (!best) return profile.error ? '⚠ error' : '–'
                const fullName = [best.firstName, best.lastName].filter(Boolean).join(' ') || String(best.name ?? '')
                return best.email ? String(best.email) : (fullName || '–')
              })() }}
            </span>
            <span
              class="text-center text-primary text-[11px] cursor-pointer"
              @click="pipeline.expandedProfileName = pipeline.expandedProfileName === profile.name ? null : String(profile.name ?? '')"
            >
              {{ pipeline.expandedProfileName === profile.name ? '▲' : '▼' }}
            </span>
            <PipelineHoldDeleteButton @delete="pipeline.deleteProfilingProfile(step.key, pi)" />
          </div>

          <div v-if="pipeline.expandedProfileName === String(profile.name ?? '')" class="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 space-y-3 text-xs">
            <div v-if="profile.error" class="text-danger">{{ profile.error }}</div>
            <template v-else>
              <!-- Company meta: links + size + parent -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <a v-if="profile.website" :href="String(profile.website)" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">Web ↗</a>
                <a v-if="profile.linkedinUrl" :href="String(profile.linkedinUrl)" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">LinkedIn ↗</a>
                <a v-if="profile.instagramUrl" :href="String(profile.instagramUrl)" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">Instagram ↗</a>
                <span v-if="profile.size" class="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono" :title="String(profile.sizeNote ?? '')">{{ profile.size }}</span>
                <span v-if="profile.sizeNote" class="text-gray-400 italic">{{ profile.sizeNote }}</span>
                <span v-if="profile.parentCompany" class="text-gray-500">Mateřská firma: <span class="font-medium text-gray-700">{{ profile.parentCompany }}</span></span>
              </div>

              <div v-if="profile.summary">
                <p class="font-medium text-gray-600 mb-0.5">Shrnutí</p>
                <p class="text-gray-700 leading-relaxed" v-html="renderLinks(profile.summary as string)" />
              </div>
              <div v-if="profile.activities">
                <p class="font-medium text-gray-600 mb-0.5">Aktivity</p>
                <p class="text-gray-600 leading-relaxed" v-html="renderLinks(profile.activities as string)" />
              </div>

              <div v-if="Array.isArray(profile.recentHighlights) && (profile.recentHighlights as unknown[]).length">
                <p class="font-medium text-gray-600 mb-0.5">Nedávné novinky</p>
                <ul class="space-y-0.5">
                  <li v-for="h in (profile.recentHighlights as string[])" :key="h" class="text-gray-600" v-html="'· ' + renderLinks(h)" />
                </ul>
              </div>

              <div v-if="Array.isArray(profile.partnershipStyle) && (profile.partnershipStyle as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1">Styl spolupráce</p>
                <div class="flex flex-wrap gap-1">
                  <span v-for="s in (profile.partnershipStyle as string[])" :key="s" class="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium">{{ s }}</span>
                </div>
              </div>

              <div v-if="Array.isArray(profile.partnershipEvidence) && (profile.partnershipEvidence as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1">Minulá spolupráce</p>
                <ul class="space-y-0.5">
                  <li v-for="e in (profile.partnershipEvidence as Record<string, unknown>[])" :key="String(e.event ?? '')" class="text-gray-600">
                    · <span v-html="renderLinks(String(e.event ?? ''))" />{{ e.year ? ' (' + e.year + ')' : '' }} — <span v-html="renderLinks(String(e.role ?? ''))" />
                    <a v-if="e.source" :href="String(e.source)" target="_blank" rel="noopener noreferrer" class="ml-1 text-primary text-[10px] hover:opacity-80">↗</a>
                  </li>
                </ul>
              </div>

              <div v-if="profile.socialInvolvement">
                <p class="font-medium text-gray-600 mb-0.5">Společenská angažovanost</p>
                <p class="text-gray-600 leading-relaxed" v-html="renderLinks(profile.socialInvolvement as string)" />
              </div>

              <div v-if="Array.isArray(profile.contacts) && (profile.contacts as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1.5">Kontakty</p>
                <div class="space-y-1">
                  <div class="grid grid-cols-[1.5rem_3rem_1fr_1fr_1fr_2.5rem_2rem_2rem] gap-1.5 px-2 py-1 font-medium text-gray-400 text-[10px]">
                    <span class="text-center">Pr.</span><span>Typ</span><span>Jméno</span><span>Role</span><span>E-mail</span><span class="text-center">Conf.</span><span class="text-center">LinkedIn</span><span class="text-center">Zdroj</span>
                  </div>
                  <template
                    v-for="(contact, ci) in (profile.contacts as Record<string, unknown>[]).slice().sort((a, b) => Number(a.priority ?? 9) - Number(b.priority ?? 9))"
                    :key="ci"
                  >
                    <div
                      class="grid grid-cols-[1.5rem_3rem_1fr_1fr_1fr_2.5rem_2rem_2rem] gap-1.5 px-2 py-1.5 rounded-t-lg border items-center"
                      :class="[ci === 0 ? 'bg-success/5 border-success/30' : 'bg-white border-gray-100', (contact.note || contact.alternativeContact || contact.sourceDate) ? 'border-b-0 rounded-b-none' : 'rounded-lg']"
                    >
                      <span
                        class="text-center font-bold text-[11px]"
                        :class="contact.priority === 1 ? 'text-success' : contact.priority === 2 ? 'text-blue-600' : contact.priority === 3 ? 'text-violet-600' : contact.priority === 4 ? 'text-amber-600' : 'text-gray-400'"
                      >{{ contact.priority }}</span>
                      <span class="text-[10px] text-gray-500 truncate" :title="String(contact.type ?? '')">{{ contact.type ?? '–' }}</span>
                      <span class="font-medium text-gray-800 truncate text-[11px]">
                        {{ [contact.firstName, contact.lastName].filter(Boolean).join(' ') || String(contact.name ?? '–') }}
                        <span v-if="ci === 0" class="ml-1 text-[9px] bg-success/15 text-success px-1 py-0.5 rounded font-semibold">★ nejlepší</span>
                      </span>
                      <span class="text-gray-500 truncate text-[11px]" :title="String(contact.role ?? '')">{{ contact.role ?? '–' }}</span>
                      <a v-if="contact.email" :href="`mailto:${contact.email}`" class="text-primary underline hover:opacity-80 truncate text-[11px]">{{ contact.email }}</a>
                      <span v-else class="text-gray-400 text-[11px]">–</span>
                      <span
                        class="text-center text-[10px] font-medium"
                        :class="contact.confidence === 'High' ? 'text-success' : contact.confidence === 'Medium' ? 'text-amber-500' : 'text-gray-400'"
                      >{{ contact.confidence ?? '–' }}</span>
                      <a v-if="contact.linkedin" :href="String(contact.linkedin)" target="_blank" rel="noopener noreferrer" class="text-center text-primary hover:opacity-80 text-[11px]" title="LinkedIn profil">↗</a>
                      <span v-else class="text-center text-gray-300 text-[11px]">–</span>
                      <a v-if="contact.source" :href="String(contact.source)" target="_blank" rel="noopener noreferrer" class="text-center text-blue-400 hover:opacity-80 text-[11px]" :title="String(contact.source)" :title2="contact.sourceDate ? String(contact.sourceDate) : undefined">↗</a>
                      <span v-else class="text-center text-gray-300 text-[11px]">–</span>
                    </div>
                    <div
                      v-if="contact.note || contact.alternativeContact || contact.sourceDate"
                      class="px-2 pb-1.5 pt-1 rounded-b-lg border border-t-0 text-[10px] text-gray-500 space-y-0.5"
                      :class="ci === 0 ? 'bg-success/5 border-success/30' : 'bg-white border-gray-100'"
                    >
                      <p v-if="contact.alternativeContact"><span class="font-medium text-gray-600">Alt. kontakt:</span> {{ contact.alternativeContact }}</p>
                      <p v-if="contact.sourceDate"><span class="font-medium text-gray-600">Datum zdroje:</span> {{ contact.sourceDate }}</p>
                      <p v-if="contact.note" class="italic text-gray-400">{{ contact.note }}</p>
                    </div>
                  </template>
                </div>
              </div>
              <div v-else class="text-gray-400 text-[11px]">Žádné kontakty nenalezeny.</div>

              <div v-if="profile.researchNotes" class="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
                <p class="font-medium text-amber-700 mb-0.5">Poznámky výzkumníka</p>
                <p class="text-amber-800 leading-relaxed" v-html="renderLinks(profile.researchNotes as string)" />
              </div>
            </template>
          </div>
        </template>
        <div v-if="!pipeline.profilingOutputProfiles(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádné profily.</div>
      </div>
    </template>

    <template v-else-if="step.key === 'VALUE_ALIGNMENT'">
      <div class="flex items-center justify-between mb-3">
        <div class="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit text-xs">
          <button
            v-for="m in [['table', 'Tabulka'], ['raw', 'Raw']]"
            :key="m[0]"
            class="px-3 py-1 rounded-lg font-medium transition-all"
            :class="pipeline.getOutputMode(step.key, 'table') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            @click="pipeline.setOutputMode(step.key, m[0])"
          >
            {{ m[1] }}
          </button>
        </div>

        </div>
      </div>

      <pre v-if="pipeline.getOutputMode(step.key, 'table') === 'raw'" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>

      <div v-else class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[1fr_7rem_3rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2 items-center">
          <span>Partner</span><span>Celková shoda</span><span class="text-center">Top arg.</span><span></span>
        </div>
        <template v-for="(alignment, ai) in pipeline.alignmentOutputAlignments(step.key)" :key="ai">
          <div
            class="grid grid-cols-[1fr_7rem_3rem_2rem] px-3 py-1 gap-2 border-t border-gray-50 items-center hover:bg-gray-50/60 cursor-pointer"
            :class="alignment.error ? 'bg-red-50' : ''"
            @click="pipeline.expandedProfileName = pipeline.expandedProfileName === (alignment.name || alignment.partnerName) ? null : String(alignment.name || alignment.partnerName || '')"
          >
            <span class="font-medium text-gray-800 truncate" :title="String(alignment.name || alignment.partnerName || '')">{{ alignment.name || alignment.partnerName }}</span>
            <span
              class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
              :class="alignment.overallFitScore === 'Vysoký' ? 'text-success bg-success/10' : alignment.overallFitScore === 'Střední' ? 'text-amber-600 bg-amber-50' : alignment.overallFitScore === 'Nízký' ? 'text-gray-400 bg-gray-100' : 'text-gray-300'"
            >{{ alignment.overallFitScore ?? '–' }}</span>
            <span
              class="text-center font-semibold text-[11px]"
              :class="Array.isArray(alignment.top3Arguments) && (alignment.top3Arguments as unknown[]).length ? 'text-success' : 'text-gray-400'"
            >{{ Array.isArray(alignment.top3Arguments) ? (alignment.top3Arguments as unknown[]).length : (alignment.error ? '⚠' : '–') }}</span>
            <PipelineHoldDeleteButton @delete.stop="pipeline.deleteProfilingProfile(step.key, ai)" />
          </div>

          <div v-if="pipeline.expandedProfileName === String(alignment.name ?? '')" class="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 space-y-3 text-xs">
            <div v-if="alignment.error" class="text-danger">{{ alignment.error }}</div>
            <template v-else>
              <div v-if="alignment.partnerSnapshot">
                <p class="font-medium text-gray-600 mb-0.5">Profil partnera</p>
                <p class="text-gray-700 leading-relaxed">{{ alignment.partnerSnapshot }}</p>
              </div>

              <div v-if="alignment.overallFitReasoning">
                <p class="font-medium text-gray-600 mb-0.5">Zdůvodnění celkové shody</p>
                <p class="text-gray-600 leading-relaxed">{{ alignment.overallFitReasoning }}</p>
              </div>

              <div v-if="alignment.hookHypothesis">
                <p class="font-medium text-gray-600 mb-0.5">Hook hypotéza</p>
                <p class="text-gray-700 leading-relaxed italic">"{{ alignment.hookHypothesis }}"</p>
              </div>

              <div v-if="Array.isArray(alignment.top3Arguments) && (alignment.top3Arguments as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1.5">Top 3 argumenty</p>
                <div class="space-y-2">
                  <div
                    v-for="arg in (alignment.top3Arguments as Record<string, unknown>[])"
                    :key="String(arg.rank ?? '')"
                    class="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 space-y-1"
                  >
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-primary text-[11px]">#{{ arg.rank }}</span>
                      <span class="font-medium text-gray-800 text-[11px]">{{ arg.argumentId }}</span>
                    </div>
                    <p v-if="arg.whyItFits" class="text-gray-700"><span class="font-medium text-gray-500">Proč funguje:</span> {{ arg.whyItFits }}</p>
                    <p v-if="arg.howToFrame" class="text-gray-600"><span class="font-medium text-gray-500">Jak formulovat:</span> {{ arg.howToFrame }}</p>
                    <p v-if="arg.whatToAvoid" class="text-amber-700 text-[10px]"><span class="font-medium">Vyhnout se:</span> {{ arg.whatToAvoid }}</p>
                  </div>
                </div>
              </div>

              <div v-if="Array.isArray(alignment.argumentAlignment) && (alignment.argumentAlignment as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1.5">Hodnocení všech argumentů</p>
                <div class="rounded-lg border border-gray-100 overflow-hidden">
                  <div class="grid grid-cols-[1fr_5rem_1fr_1fr] bg-gray-50 px-3 py-1 font-medium text-gray-400 gap-2 text-[10px]">
                    <span>Argument</span><span class="text-center">Relevance</span><span>Zdůvodnění</span><span>Rizika</span>
                  </div>
                  <div
                    v-for="a in (alignment.argumentAlignment as Record<string, unknown>[])"
                    :key="String(a.argumentId ?? '')"
                    class="grid grid-cols-[1fr_5rem_1fr_1fr] px-3 py-1.5 gap-2 border-t border-gray-50 items-start"
                  >
                    <span class="font-medium text-gray-700 text-[10px]">{{ a.argumentLabel ?? a.argumentId }}</span>
                    <span
                      class="text-center text-[10px] font-semibold"
                      :class="a.relevance === 'Vysoká' ? 'text-success' : a.relevance === 'Střední' ? 'text-amber-500' : a.relevance === 'Nevhodné' ? 'text-danger' : 'text-gray-400'"
                    >{{ a.relevance ?? '–' }}</span>
                    <span class="text-gray-500 text-[10px] leading-relaxed">{{ a.reasoning }}</span>
                    <span v-if="a.redFlags" class="text-amber-600 text-[10px] leading-relaxed">{{ a.redFlags }}</span>
                    <span v-else class="text-gray-300 text-[10px]">–</span>
                  </div>
                </div>
              </div>

              <div v-if="alignment.recommendedContact && typeof alignment.recommendedContact === 'object'">
                <p class="font-medium text-gray-600 mb-1">Doporučený kontakt</p>
                <div class="rounded-lg border border-gray-100 bg-white px-3 py-2 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-semibold">Primární</span>
                    <span class="font-medium text-gray-800 text-[11px]">{{ (alignment.recommendedContact as Record<string, unknown>).primary && ((alignment.recommendedContact as Record<string, Record<string, unknown>>).primary.name ?? ((alignment.recommendedContact as Record<string, Record<string, unknown>>).primary.role)) }}</span>
                  </div>
                  <p class="text-gray-500 text-[10px]">{{ ((alignment.recommendedContact as Record<string, Record<string, unknown>>).primary?.reasoning) }}</p>
                </div>
              </div>

              <div v-if="Array.isArray(alignment.argumentsToDrop) && (alignment.argumentsToDrop as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1">Argumenty k vynechání</p>
                <ul class="space-y-0.5">
                  <li v-for="d in (alignment.argumentsToDrop as Record<string, unknown>[])" :key="String(d.argumentId ?? '')" class="text-[10px] text-gray-500">
                    · <span class="font-medium">{{ d.argumentId }}</span> — {{ d.reason }}
                  </li>
                </ul>
              </div>

              <div v-if="Array.isArray(alignment.flagsAndRisks) && (alignment.flagsAndRisks as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1">Rizika a upozornění</p>
                <ul class="space-y-0.5">
                  <li v-for="f in (alignment.flagsAndRisks as string[])" :key="f" class="text-[10px] text-amber-700">
                    · {{ f }}
                  </li>
                </ul>
              </div>
            </template>
          </div>
        </template>
        <div v-if="!pipeline.alignmentOutputAlignments(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádné analýzy.</div>
      </div>
    </template>

    <template v-else-if="step.key === 'PARTNER_IDENTIFICATION'">
      <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
        <button
          v-for="m in [['table', 'Přehled'], ['raw', 'Raw']]"
          :key="m[0]"
          class="px-3 py-1 rounded-lg font-medium transition-all"
          :class="pipeline.getOutputMode(step.key, 'table') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          @click="pipeline.setOutputMode(step.key, m[0])"
        >
          {{ m[1] }}
        </button>
      </div>

      <pre v-if="pipeline.getOutputMode(step.key, 'table') === 'raw'" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>

      <div v-else class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span>#</span><span>Položka</span><span>Hledaný výraz</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span><span></span>
        </div>
        <template v-for="(pi, idx) in pipeline.partnerItems(step.key)" :key="idx">
          <div
            class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_2rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center hover:bg-gray-50/60 cursor-pointer"
            :class="pi.error ? 'bg-red-50' : 'bg-white'"
            @click="expandedItem = expandedItem === pi.itemName ? null : pi.itemName"
          >
            <span class="text-gray-400">{{ idx + 1 }}</span>
            <span class="font-medium text-gray-700 truncate" :title="pi.itemName">{{ pi.itemName }}</span>
            <span class="truncate text-gray-400 text-[10px]" :title="pi.searchTerm">{{ pi.searchTerm ?? '…' }}</span>
            <span class="text-center text-gray-500">{{ pi.serpResults ?? '–' }}</span>
            <span class="text-center text-gray-500">{{ pi.pagesLoaded ?? '–' }}</span>
            <span class="text-center font-semibold" :class="(pi.partners?.length ?? 0) > 0 ? 'text-success' : 'text-gray-400'">{{ pi.partners?.length ?? (pi.error ? '✗' : '–') }}</span>
            <PipelineHoldDeleteButton @delete.stop="pipeline.deletePartnerItem(step.key, idx)" />
          </div>
          <div v-if="expandedItem === pi.itemName" class="px-4 pb-3 pt-2 border-t border-gray-100 bg-gray-50/50">
            <div v-if="pi.error" class="text-danger text-[11px]">{{ pi.error }}</div>
            <div v-else-if="!pi.partners?.length" class="text-gray-400 text-[11px]">Žádní partneři nenalezeni.</div>
            <ul v-else class="space-y-1">
              <li
                v-for="p in pi.partners"
                :key="p.partnerId"
                class="flex items-center gap-2 text-[11px] text-gray-700"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"></span>
                <span class="font-medium">{{ p.name }}</span>
                <span v-if="p.isNew" class="text-[9px] bg-success/10 text-success px-1.5 py-0.5 rounded-full font-semibold">nový</span>
              </li>
            </ul>
          </div>
        </template>
        <div v-if="!pipeline.partnerItems(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádné položky.</div>
      </div>
    </template>

    <template v-else-if="step.key === 'MARKET_SCANNING'">
      <template v-if="pipeline.resolveTable(step.key)">
        <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
          <button
            v-for="m in [['table', 'Tabulka'], ['raw', 'Raw']]"
            :key="m[0]"
            class="px-3 py-1 rounded-lg font-medium transition-all"
            :class="pipeline.getOutputMode(step.key, 'table') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            @click="pipeline.setOutputMode(step.key, m[0])"
          >
            {{ m[1] }}
          </button>
        </div>

        <div v-if="pipeline.getOutputMode(step.key, 'table') === 'table'" class="rounded-lg border border-gray-100 overflow-hidden text-xs">
          <div class="overflow-x-auto max-h-64 overflow-y-auto">
            <div
              class="grid bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2 sticky top-0 z-10 border-b border-gray-100"
              :style="tableGridStyleSimple"
            >
              <span
                v-for="col in pipeline.tableColumns(pipeline.resolveTable(step.key)!.rows)"
                :key="col"
                class="truncate whitespace-nowrap"
              >
                {{ col }}
              </span>
              <span></span>
            </div>
            <div
              v-for="(row, ri) in pipeline.resolveTable(step.key)!.rows"
              :key="ri"
              class="grid px-3 py-1.5 gap-2 border-t border-gray-50 items-center hover:bg-gray-50/60 bg-white"
              :style="tableGridStyleSimple"
            >
              <span
                v-for="col in pipeline.tableColumns(pipeline.resolveTable(step.key)!.rows)"
                :key="col"
                class="text-gray-600 truncate text-[11px]"
                :title="String(row[col] ?? '')"
              >
                {{ typeof row[col] === 'object' ? JSON.stringify(row[col]) : (row[col] ?? '–') }}
              </span>
              <PipelineHoldDeleteButton @delete="pipeline.deleteTableRow(step.key, ri)" />
            </div>
            <div v-if="!pipeline.resolveTable(step.key)!.rows.length" class="px-3 py-3 text-gray-400 text-center">
              Žádné záznamy.
            </div>
          </div>
        </div>

        <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>
      </template>

      <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>
    </template>

    <template v-else-if="step.key === 'OUTREACH_PREPARATION'">
      <div class="space-y-4">
        <div
          v-for="(email, ei) in pipeline.outreachEmails()"
          :key="ei"
          class="rounded-xl border bg-white overflow-hidden"
          :class="email.error ? 'border-danger/30' : 'border-gray-200'"
        >
          <!-- Email header -->
          <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-gray-800 text-sm truncate">{{ email.partnerName }}</span>
              <span v-if="email.error" class="text-[11px] bg-danger/10 text-danger px-2 py-0.5 rounded-full">chyba</span>
            </div>
            <button
              v-if="!email.error"
              type="button"
              class="shrink-0 text-[11px] text-primary hover:underline"
              @click="pipeline.step6SelectedPartnerName = String(email.partnerName ?? ''); pipeline.initStep6Preview(String(email.partnerName ?? ''))"
            >
              Použít v Kroku 6 →
            </button>
          </div>

          <div v-if="email.error" class="px-4 py-3 text-sm text-danger">{{ email.error }}</div>
          <template v-else>
            <!-- Subject line -->
            <div class="px-4 pt-3 pb-1 flex items-baseline gap-2">
              <span class="text-[11px] font-medium text-gray-400 shrink-0 uppercase tracking-wide">Předmět</span>
              <span class="font-semibold text-gray-800 text-sm">{{ email.subject }}</span>
            </div>
            <!-- To -->
            <div v-if="email.to" class="px-4 pb-2 flex items-baseline gap-2">
              <span class="text-[11px] font-medium text-gray-400 shrink-0 uppercase tracking-wide w-14">Komu</span>
              <span class="text-sm text-gray-600">{{ email.to }}</span>
            </div>
            <!-- Body -->
            <div class="px-4 pb-4 pt-2 border-t border-gray-50">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Tělo e-mailu</p>
              <div class="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-[Parkinsans,sans-serif] max-h-64 overflow-y-auto">{{ email.body }}</div>
            </div>
          </template>
        </div>
        <div v-if="!pipeline.outreachEmails().length" class="text-center py-8 text-gray-400 text-sm">
          Žádné e-maily nebyly vygenerovány.
        </div>
      </div>
    </template>

    <template v-else-if="step.key === 'OUTREACH_EXECUTION'">
      <div v-if="pipeline.getStepResult(step.key)?.outputData" class="rounded-xl border border-success/30 bg-success/5 p-5">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="font-semibold text-success text-sm">Gmail draft vytvořen</p>
        </div>
        <div class="space-y-1.5 text-sm">
          <div class="flex gap-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 shrink-0 pt-0.5">Komu</span>
            <span class="text-gray-700">{{ (pipeline.getStepResult(step.key)?.outputData as Record<string, unknown>)?.to }}</span>
          </div>
          <div class="flex gap-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 shrink-0 pt-0.5">Předmět</span>
            <span class="text-gray-700 font-medium">{{ (pipeline.getStepResult(step.key)?.outputData as Record<string, unknown>)?.subject }}</span>
          </div>
          <div class="flex gap-3">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 shrink-0 pt-0.5">Draft ID</span>
            <span class="text-gray-500 font-mono text-xs">{{ (pipeline.getStepResult(step.key)?.outputData as Record<string, unknown>)?.gmailDraftId }}</span>
          </div>
        </div>
        <a
          class="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          href="https://mail.google.com/mail/u/0/#drafts"
          target="_blank"
          rel="noopener noreferrer"
        >
          Otevřít drafty v Gmailu ↗
        </a>
      </div>
    </template>

  </div>
</template>
