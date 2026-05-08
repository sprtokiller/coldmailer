<script setup lang="ts">
import { pipelineRunKey, type StepDefinition, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  step: StepDefinition
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>
if (!pipeline) {
  throw new Error('Pipeline run context is missing')
}

function renderLinks(text: string | null | undefined): string {
  if (!text) return ''
  return String(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">$1</a>')
}

const selectedRows = ref<Set<number>>(new Set())
const tableRows = computed(() => pipeline.resolveTable(props.step.key)?.rows ?? [])
const allSelected = computed(() => tableRows.value.length > 0 && selectedRows.value.size === tableRows.value.length)
const someSelected = computed(() => selectedRows.value.size > 0 && selectedRows.value.size < tableRows.value.length)

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

      <pre v-if="pipeline.getOutputMode(step.key, 'table') === 'raw'" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>

      <div v-else class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[1fr_8rem_3rem_1fr_4rem_2rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
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
            <button type="button" class="text-gray-300 hover:text-danger transition-colors text-center leading-none" title="Smazat" @click.stop="pipeline.deleteProfilingProfile(step.key, pi)">✕</button>
          </div>

          <div v-if="pipeline.expandedProfileName === String(profile.name ?? '')" class="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 space-y-3 text-xs">
            <div v-if="profile.error" class="text-danger">{{ profile.error }}</div>
            <template v-else>
              <div v-if="profile.summary">
                <p class="font-medium text-gray-600 mb-0.5">Shrnutí</p>
                <p class="text-gray-700 leading-relaxed" v-html="renderLinks(profile.summary as string)" />
              </div>
              <div v-if="profile.activities">
                <p class="font-medium text-gray-600 mb-0.5">Aktivity</p>
                <p class="text-gray-600 leading-relaxed" v-html="renderLinks(profile.activities as string)" />
              </div>
              <div v-if="Array.isArray(profile.partnershipEvidence) && (profile.partnershipEvidence as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1">Minulá spolupráce</p>
                <ul class="space-y-0.5">
                  <li v-for="e in (profile.partnershipEvidence as Record<string, unknown>[])" :key="String(e.event ?? '')" class="text-gray-600">
                    · {{ e.event }}{{ e.year ? ' (' + e.year + ')' : '' }} — {{ e.role }}
                    <a v-if="e.source" :href="String(e.source)" target="_blank" rel="noopener noreferrer" class="ml-1 text-primary text-[10px] hover:opacity-80">↗</a>
                  </li>
                </ul>
              </div>

              <div v-if="Array.isArray(profile.contacts) && (profile.contacts as unknown[]).length">
                <p class="font-medium text-gray-600 mb-1.5">Kontakty</p>
                <div class="space-y-1">
                  <div class="grid grid-cols-[1.5rem_3rem_1fr_1fr_1fr_2.5rem_2rem_2rem] gap-1.5 px-2 py-1 font-medium text-gray-400 text-[10px]">
                    <span class="text-center">Pr.</span><span>Typ</span><span>Jméno</span><span>Role</span><span>E-mail</span><span class="text-center">Conf.</span><span class="text-center">LinkedIn</span><span class="text-center">Zdroj</span>
                  </div>
                  <div
                    v-for="(contact, ci) in (profile.contacts as Record<string, unknown>[]).slice().sort((a, b) => Number(a.priority ?? 9) - Number(b.priority ?? 9))"
                    :key="ci"
                    class="grid grid-cols-[1.5rem_3rem_1fr_1fr_1fr_2.5rem_2rem_2rem] gap-1.5 px-2 py-1.5 rounded-lg border items-center"
                    :class="ci === 0 ? 'bg-success/5 border-success/30' : 'bg-white border-gray-100'"
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
                    <a v-if="contact.source" :href="String(contact.source)" target="_blank" rel="noopener noreferrer" class="text-center text-blue-400 hover:opacity-80 text-[11px]" :title="String(contact.source)">↗</a>
                    <span v-else class="text-center text-gray-300 text-[11px]">–</span>
                  </div>
                </div>
              </div>
              <div v-else class="text-gray-400 text-[11px]">Žádné kontakty nenalezeny.</div>
            </template>
          </div>
        </template>
        <div v-if="!pipeline.profilingOutputProfiles(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádné profily.</div>
      </div>
    </template>

    <template v-else-if="step.key === 'PARTNER_IDENTIFICATION'">
      <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
        <button
          v-for="m in [['item', 'Podle položek'], ['candidates', 'Kandidáti'], ['raw', 'Raw']]"
          :key="m[0]"
          class="px-3 py-1 rounded-lg font-medium transition-all"
          :class="pipeline.getOutputMode(step.key, 'item') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          @click="pipeline.setOutputMode(step.key, m[0])"
        >
          {{ m[1] }}
        </button>
      </div>

      <div v-if="pipeline.getOutputMode(step.key, 'item') === 'item'" class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span>#</span><span>Položka</span><span>Hledaný výraz</span><span class="text-center">Výsledků</span><span class="text-center">Stránek</span><span class="text-center">Partnerů</span>
        </div>
        <div
          v-for="(pi, idx) in pipeline.partnerItems(step.key)"
          :key="idx"
          class="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem] px-3 py-1.5 gap-2 border-t border-gray-50 items-center"
          :class="pi.error ? 'bg-red-50' : 'bg-white'"
        >
          <span class="text-gray-400">{{ idx + 1 }}</span>
          <span class="truncate font-medium text-gray-700" :title="pi.itemName">{{ pi.itemName }}</span>
          <span class="truncate text-gray-400 text-[10px]" :title="pi.searchTerm">{{ pi.searchTerm ?? '…' }}</span>
          <span class="text-center text-gray-500">{{ pi.serpResults ?? '–' }}</span>
          <span class="text-center text-gray-500">{{ pi.pagesLoaded ?? '–' }}</span>
          <span class="text-center font-semibold" :class="(pi.partners?.length ?? 0) > 0 ? 'text-success' : 'text-gray-400'">{{ pi.partners?.length ?? (pi.error ? '✗' : '–') }}</span>
        </div>
      </div>

      <div v-else-if="pipeline.getOutputMode(step.key, 'item') === 'candidates'" class="rounded-lg border border-gray-100 overflow-hidden text-xs">
        <div class="grid grid-cols-[1fr_5rem] bg-gray-50 px-3 py-1.5 font-medium text-gray-400 gap-2">
          <span>Kandidát</span><span class="text-center">Počet položek</span>
        </div>
        <div v-for="(c, ci) in pipeline.candidateList(step.key)" :key="ci" class="grid grid-cols-[1fr_5rem] px-3 py-1.5 gap-2 border-t border-gray-50 bg-white items-center">
          <span class="font-medium text-gray-700">{{ c.name }}</span>
          <div class="relative text-center">
            <span class="cursor-default underline decoration-dotted text-gray-600 font-semibold" @mouseenter="pipeline.candidateHoverIdx = ci" @mouseleave="pipeline.candidateHoverIdx = null">{{ c.itemCount }}</span>
            <div v-if="pipeline.candidateHoverIdx === ci" class="absolute right-0 bottom-full mb-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 text-left min-w-[14rem] max-w-xs">
              <p class="font-medium text-gray-700 mb-1 text-[11px]">Položky ({{ c.itemCount }}):</p>
              <ul class="space-y-0.5">
                <li v-for="n in c.itemNames" :key="n" class="text-gray-500 truncate text-[11px]">· {{ n }}</li>
              </ul>
            </div>
          </div>
        </div>
        <div v-if="!pipeline.candidateList(step.key).length" class="px-3 py-3 text-gray-400 text-center">Žádní kandidáti.</div>
      </div>

      <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>
    </template>

    <template v-else>
      <template v-if="pipeline.resolveTable(step.key)">
        <div class="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit text-xs">
          <button
            v-for="m in [['table', 'Table'], ['raw', 'Raw']]"
            :key="m[0]"
            class="px-3 py-1 rounded-lg font-medium transition-all"
            :class="pipeline.getOutputMode(step.key, 'table') === m[0] ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            @click="pipeline.setOutputMode(step.key, m[0])"
          >
            {{ m[1] }}
          </button>
        </div>

        <div v-if="pipeline.getOutputMode(step.key, 'table') === 'table'">
          <div v-if="selectedRows.size > 0" class="flex items-center gap-3 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
            <span class="text-primary font-medium">{{ selectedRows.size }} vybráno</span>
            <button type="button" class="text-danger hover:underline ml-auto" @click="deleteSelectedRows">Smazat vybrané</button>
            <button type="button" class="text-gray-400 hover:text-gray-600" @click="selectedRows = new Set()">Zrušit</button>
          </div>
          <div class="overflow-x-auto rounded-lg border border-gray-100 text-xs max-h-64 overflow-y-auto">
            <p v-if="pipeline.resolveTable(step.key)!.wrapKey" class="px-3 py-1.5 text-[10px] text-gray-400 bg-gray-50 border-b border-gray-100 font-mono">
              {{ pipeline.resolveTable(step.key)!.wrapKey }}
            </p>
            <table class="w-full border-collapse">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-3 py-1.5 border-b border-gray-100 w-6">
                    <input
                      type="checkbox"
                      :checked="allSelected"
                      :ref="(el) => { if (el) (el as HTMLInputElement).indeterminate = someSelected }"
                      class="accent-primary cursor-pointer"
                      @change="toggleSelectAll"
                    />
                  </th>
                  <th
                    v-for="col in pipeline.tableColumns(pipeline.resolveTable(step.key)!.rows)"
                    :key="col"
                    class="text-left px-3 py-1.5 font-medium text-gray-400 border-b border-gray-100 whitespace-nowrap"
                  >
                    {{ col }}
                  </th>
                  <th class="px-2 py-1.5 border-b border-gray-100 w-6"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, ri) in pipeline.resolveTable(step.key)!.rows"
                  :key="ri"
                  class="border-t border-gray-50 hover:bg-gray-50/60"
                  :class="selectedRows.has(ri) ? 'bg-primary/5' : ''"
                >
                  <td class="px-3 py-1.5 align-top">
                    <input type="checkbox" :checked="selectedRows.has(ri)" class="accent-primary cursor-pointer" @change="toggleRow(ri)" />
                  </td>
                  <td v-for="col in pipeline.tableColumns(pipeline.resolveTable(step.key)!.rows)" :key="col" class="px-3 py-1.5 text-gray-600 align-top max-w-xs">
                    <span class="block truncate" :title="String(row[col] ?? '')">{{ typeof row[col] === 'object' ? JSON.stringify(row[col]) : (row[col] ?? '–') }}</span>
                  </td>
                  <td class="px-2 py-1.5 align-top text-center">
                    <button type="button" class="text-gray-300 hover:text-danger transition-colors" title="Smazat řádek" @click="pipeline.deleteTableRow(step.key, ri)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>
      </template>

      <pre v-else class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{{ pipeline.stepResultOutput(step.key) }}</pre>
    </template>
  </div>
</template>
