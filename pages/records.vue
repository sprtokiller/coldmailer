<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const TABS = [
  { key: 'COMPETITION',  label: 'Soutěže' },
  { key: 'PARTNER',      label: 'Partneři' },
  { key: 'ORGANISATION', label: 'Organizace' },
  { key: 'CHANNEL',      label: 'Kanály' },
  { key: 'SOURCE',       label: 'Zdroje' },
  { key: 'OPPORTUNITY',  label: 'Příležitosti' },
] as const
type TabKey = typeof TABS[number]['key']

const LEVEL_LABELS: Record<string, string> = {
  school: 'Školní', regional: 'Regionální', national: 'Národní', international: 'Mezinárodní',
}
const COMP_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700', inactive: 'bg-gray-100 text-gray-400', uncertain: 'bg-amber-50 text-amber-600',
}
const COMP_STATUS_LABELS: Record<string, string> = {
  active: 'Aktivní', inactive: 'Neaktivní', uncertain: 'Nejistý',
}
const STEP_LABELS: Record<string, string> = {
  MARKET_SCANNING: 'Market Scanning', PARTNER_IDENTIFICATION: 'Identifikace partnerů',
  PARTNER_PROFILING: 'Profilování', VALUE_ALIGNMENT: 'Value Alignment',
  OUTREACH_PREPARATION: 'Příprava oslovení', OUTREACH_EXECUTION: 'Odeslání',
}

interface PipelineRef {
  id: string; addedAt: string
  pipelineRun: { id: string; name: string }
  step: { stepType: string }
}
interface GlobalRecord {
  id: string; type: string; canonicalName: string; createdAt: string
  payload: Record<string, string>
  creator: { id: string; name: string; image: string | null }
  _count: { pipelineRefs: number }
  pipelineRefs: PipelineRef[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const activeTab = ref<TabKey>('COMPETITION')
const records   = ref<GlobalRecord[]>([])
const loading   = ref(false)
const offset    = ref(0)
const limit     = 100

async function fetchRecords(reset = false) {
  if (reset) offset.value = 0
  loading.value = true
  try {
    const data = await $fetch<GlobalRecord[]>('/api/records', {
      query: { type: activeTab.value, offset: offset.value, limit },
    })
    records.value = reset ? data : [...records.value, ...data]
  } finally {
    loading.value = false
  }
}

watch(activeTab, () => { resetFilters(); fetchRecords(true) })
onMounted(() => fetchRecords(true))

const hasMore = computed(() => records.value.length > 0 && records.value.length === offset.value + limit)
function loadMore() { offset.value += limit; fetchRecords(false) }

// ── Client-side filters ───────────────────────────────────────────────────────

const search          = ref('')
const filterType      = ref('')
const filterLevel     = ref('')
const filterStatus    = ref('')
const filterIndustry  = ref('')

function resetFilters() {
  search.value = ''; filterType.value = ''; filterLevel.value = ''; filterStatus.value = ''; filterIndustry.value = ''
}

// Unique values derived from loaded records
const availableTypes      = computed(() => [...new Set(records.value.map(r => r.payload.type).filter(Boolean))].sort())
const availableLevels     = computed(() => ['school', 'regional', 'national', 'international'].filter(l => records.value.some(r => r.payload.level === l)))
const availableStatuses   = computed(() => ['active', 'inactive', 'uncertain'].filter(s => records.value.some(r => r.payload.status === s)))
const availableIndustries = computed(() => [...new Set(records.value.map(r => r.payload.industry || r.payload.type).filter(Boolean))].sort())

// Distinct pipeline count from loaded refs
function distinctPipelineCount(rec: GlobalRecord): number {
  return new Set(rec.pipelineRefs.map(r => r.pipelineRun.id)).size || rec._count.pipelineRefs
}

const filteredRecords = computed(() => {
  const q = search.value.toLowerCase()
  return records.value.filter(rec => {
    const p = rec.payload
    if (q && !rec.canonicalName.toLowerCase().includes(q)) return false
    if (filterType.value     && p.type !== filterType.value)           return false
    if (filterLevel.value    && p.level !== filterLevel.value)         return false
    if (filterStatus.value   && p.status !== filterStatus.value)       return false
    if (filterIndustry.value && (p.industry || p.type) !== filterIndustry.value) return false
    return true
  })
})

const activeFilterCount = computed(() =>
  [filterType.value, filterLevel.value, filterStatus.value, filterIndustry.value].filter(Boolean).length
)

// ── Expand ────────────────────────────────────────────────────────────────────

const expandedIds = ref(new Set<string>())
function toggleExpand(id: string) {
  const s = new Set(expandedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedIds.value = s
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold text-gray-800">Databáze</h1>
      <p class="text-sm text-gray-400 mt-1">Všechny záznamy uložené napříč pipeline</p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-gray-200 mb-5">
      <button
        v-for="tab in TABS" :key="tab.key"
        :class="['px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- Search + filters (competition only) -->
    <div class="mb-4 space-y-2.5">
      <input
        v-model="search"
        type="text"
        placeholder="Hledat podle názvu..."
        class="w-full max-w-sm text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
      />

      <template v-if="activeTab === 'COMPETITION'">
        <!-- Type chips -->
        <div v-if="availableTypes.length" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 font-medium w-12 flex-shrink-0">Typ</span>
          <button
            v-for="t in availableTypes" :key="t"
            :class="['text-xs px-2.5 py-1 rounded-full border transition-colors', filterType === t ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
            @click="filterType = filterType === t ? '' : t"
          >{{ t }}</button>
        </div>

        <!-- Level chips -->
        <div v-if="availableLevels.length" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 font-medium w-12 flex-shrink-0">Úroveň</span>
          <button
            v-for="l in availableLevels" :key="l"
            :class="['text-xs px-2.5 py-1 rounded-full border transition-colors', filterLevel === l ? 'bg-purple-100 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
            @click="filterLevel = filterLevel === l ? '' : l"
          >{{ LEVEL_LABELS[l] ?? l }}</button>
        </div>

        <!-- Status chips -->
        <div v-if="availableStatuses.length" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 font-medium w-12 flex-shrink-0">Stav</span>
          <button
            v-for="s in availableStatuses" :key="s"
            :class="['text-xs px-2.5 py-1 rounded-full border transition-colors', filterStatus === s ? COMP_STATUS_COLORS[s] + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
            @click="filterStatus = filterStatus === s ? '' : s"
          >{{ COMP_STATUS_LABELS[s] ?? s }}</button>
        </div>

        <!-- Active filter summary + clear -->
        <div v-if="activeFilterCount > 0" class="flex items-center gap-2">
          <span class="text-xs text-gray-400">{{ filteredRecords.length }} z {{ records.length }} záznamů</span>
          <button class="text-xs text-indigo-500 hover:underline" @click="filterType = ''; filterLevel = ''; filterStatus = ''">Zrušit filtry</button>
        </div>
      </template>

      <template v-else-if="activeTab === 'PARTNER'">
        <!-- Industry chips -->
        <div v-if="availableIndustries.length" class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-400 font-medium w-16 flex-shrink-0">Odvětví</span>
          <button
            v-for="ind in availableIndustries" :key="ind"
            :class="['text-xs px-2.5 py-1 rounded-full border transition-colors', filterIndustry === ind ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
            @click="filterIndustry = filterIndustry === ind ? '' : ind"
          >{{ ind }}</button>
        </div>
        <div v-if="activeFilterCount > 0" class="flex items-center gap-2">
          <span class="text-xs text-gray-400">{{ filteredRecords.length }} z {{ records.length }} partnerů</span>
          <button class="text-xs text-indigo-500 hover:underline" @click="filterIndustry = ''">Zrušit filtry</button>
        </div>
      </template>
    </div>

    <!-- ── COMPETITION table ── -->
    <template v-if="activeTab === 'COMPETITION'">
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50 text-left">
              <th class="px-4 py-3 w-7" />
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Název</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Pořadatel</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Stav</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Použito</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přidal</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="loading && records.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
            </tr>
            <tr v-else-if="filteredRecords.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Žádné záznamy</td>
            </tr>
            <template v-else>
              <template v-for="rec in filteredRecords" :key="rec.id">
                <tr class="hover:bg-gray-50 cursor-pointer transition-colors" @click="toggleExpand(rec.id)">
                  <td class="px-4 py-3">
                    <svg class="w-3 h-3 text-gray-300 transition-transform" :class="expandedIds.has(rec.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                  <td class="px-4 py-3 font-medium text-gray-800">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-64">{{ rec.canonicalName }}</span>
                      <a v-if="rec.payload.url" :href="rec.payload.url" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0" @click.stop>↗</a>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-gray-600 max-w-48 truncate">{{ rec.payload.organizer || '—' }}</td>
                  <td class="px-4 py-3">
                    <span v-if="rec.payload.status" :class="['text-xs px-2 py-0.5 rounded', COMP_STATUS_COLORS[rec.payload.status] ?? 'bg-gray-50 text-gray-400']">
                      {{ COMP_STATUS_LABELS[rec.payload.status] ?? rec.payload.status }}
                    </span>
                    <span v-else class="text-xs text-gray-300">—</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs font-medium text-gray-700">{{ rec._count.pipelineRefs }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5">
                      <img v-if="rec.creator.image" :src="rec.creator.image" :alt="rec.creator.name" class="w-5 h-5 rounded-full flex-shrink-0" referrerpolicy="no-referrer" />
                      <span class="text-xs text-gray-500 truncate max-w-28">{{ rec.creator.name }}</span>
                    </div>
                  </td>
                </tr>

                <!-- Expanded detail row -->
                <tr v-if="expandedIds.has(rec.id)" class="bg-indigo-50/20">
                  <td />
                  <td colspan="5" class="px-4 py-4 space-y-3">
                    <!-- Tags -->
                    <div class="flex flex-wrap gap-1.5">
                      <span v-if="rec.payload.type"   class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">{{ rec.payload.type }}</span>
                      <span v-if="rec.payload.level"  class="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600">{{ LEVEL_LABELS[rec.payload.level] ?? rec.payload.level }}</span>
                      <span v-if="rec.payload.target_group" class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{{ rec.payload.target_group }}</span>
                      <span v-if="rec.payload.frequency" class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{{ rec.payload.frequency === 'unknown' ? 'frekvence neznámá' : rec.payload.frequency }}</span>
                    </div>
                    <!-- Description -->
                    <p v-if="rec.payload.description" class="text-sm text-gray-600 leading-relaxed">{{ rec.payload.description }}</p>
                    <!-- Pipeline links -->
                    <div v-if="rec.pipelineRefs.length > 0" class="flex flex-wrap gap-2">
                      <NuxtLink
                        v-for="ref in rec.pipelineRefs" :key="ref.id"
                        :to="`/pipeline/${ref.pipelineRun.id}`"
                        class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      >
                        <span>{{ ref.pipelineRun.name }}</span>
                        <span class="text-gray-300">·</span>
                        <span class="text-gray-400">{{ STEP_LABELS[ref.step.stepType] ?? ref.step.stepType }}</span>
                      </NuxtLink>
                      <span v-if="rec._count.pipelineRefs > rec.pipelineRefs.length" class="text-xs text-gray-400 self-center">
                        + {{ rec._count.pipelineRefs - rec.pipelineRefs.length }} dalších
                      </span>
                    </div>
                    <p v-else class="text-xs text-gray-400">Nepoužito v žádné pipeline</p>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── PARTNER table ── -->
    <template v-else-if="activeTab === 'PARTNER'">
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50 text-left">
              <th class="px-4 py-3 w-7" />
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Název</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Odvětví</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Pipeline</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Celkem použití</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přidal</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="loading && records.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
            </tr>
            <tr v-else-if="filteredRecords.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Žádní partneři</td>
            </tr>
            <template v-else>
              <template v-for="rec in filteredRecords" :key="rec.id">
                <tr class="hover:bg-gray-50 cursor-pointer transition-colors" @click="toggleExpand(rec.id)">
                  <td class="px-4 py-3">
                    <svg class="w-3 h-3 text-gray-300 transition-transform" :class="expandedIds.has(rec.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                  <td class="px-4 py-3 font-medium text-gray-800">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-64">{{ rec.canonicalName }}</span>
                      <a v-if="rec.payload.website || rec.payload.url" :href="rec.payload.website || rec.payload.url" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0" @click.stop>↗</a>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span v-if="rec.payload.industry || rec.payload.type" class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ rec.payload.industry || rec.payload.type }}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="text-xs font-semibold text-gray-700">{{ distinctPipelineCount(rec) }}</span>
                  </td>
                  <td class="px-4 py-3 text-center text-xs text-gray-400">{{ rec._count.pipelineRefs }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5">
                      <img v-if="rec.creator.image" :src="rec.creator.image" :alt="rec.creator.name" class="w-5 h-5 rounded-full flex-shrink-0" referrerpolicy="no-referrer" />
                      <span class="text-xs text-gray-500 truncate max-w-28">{{ rec.creator.name }}</span>
                    </div>
                  </td>
                </tr>

                <!-- Expanded detail row -->
                <tr v-if="expandedIds.has(rec.id)" class="bg-indigo-50/20">
                  <td />
                  <td colspan="5" class="px-4 py-4 space-y-3">
                    <p v-if="rec.payload.description" class="text-sm text-gray-600 leading-relaxed">{{ rec.payload.description }}</p>
                    <!-- Pipeline links grouped by distinct run -->
                    <div v-if="rec.pipelineRefs.length > 0" class="flex flex-wrap gap-2">
                      <NuxtLink
                        v-for="ref in rec.pipelineRefs" :key="ref.id"
                        :to="`/pipeline/${ref.pipelineRun.id}`"
                        class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      >
                        <span>{{ ref.pipelineRun.name }}</span>
                        <span class="text-gray-300">·</span>
                        <span class="text-gray-400">{{ STEP_LABELS[ref.step.stepType] ?? ref.step.stepType }}</span>
                      </NuxtLink>
                      <span v-if="rec._count.pipelineRefs > rec.pipelineRefs.length" class="text-xs text-gray-400 self-center">
                        + {{ rec._count.pipelineRefs - rec.pipelineRefs.length }} dalších
                      </span>
                    </div>
                    <p v-else class="text-xs text-gray-400">Nepoužito v žádné pipeline</p>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── Generic table ── -->
    <template v-else>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50 text-left">
              <th class="px-4 py-3 w-7" />
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Název</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Použito</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přidal</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Datum</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="loading && records.length === 0">
              <td colspan="5" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
            </tr>
            <tr v-else-if="filteredRecords.length === 0">
              <td colspan="5" class="text-center py-12 text-gray-400 text-sm">Žádné záznamy</td>
            </tr>
            <template v-else>
              <template v-for="rec in filteredRecords" :key="rec.id">
                <tr class="hover:bg-gray-50 cursor-pointer transition-colors" @click="toggleExpand(rec.id)">
                  <td class="px-4 py-3">
                    <svg class="w-3 h-3 text-gray-300 transition-transform" :class="expandedIds.has(rec.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                  <td class="px-4 py-3 font-medium text-gray-800">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-96">{{ rec.canonicalName }}</span>
                      <a v-if="rec.payload.url" :href="rec.payload.url" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0" @click.stop>↗</a>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center text-xs font-medium text-gray-700">{{ rec._count.pipelineRefs }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1.5">
                      <img v-if="rec.creator.image" :src="rec.creator.image" :alt="rec.creator.name" class="w-5 h-5 rounded-full" referrerpolicy="no-referrer" />
                      <span class="text-xs text-gray-500 truncate max-w-28">{{ rec.creator.name }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-gray-400">{{ new Date(rec.createdAt).toLocaleDateString('cs-CZ') }}</td>
                </tr>
                <tr v-if="expandedIds.has(rec.id)" class="bg-indigo-50/20">
                  <td />
                  <td colspan="4" class="px-4 py-3 space-y-2">
                    <div class="flex flex-wrap gap-1">
                      <span v-for="(val, key) in rec.payload" :key="key" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        <span class="font-medium text-gray-600">{{ key }}:</span> {{ String(val).slice(0, 60) }}
                      </span>
                    </div>
                    <div v-if="rec.pipelineRefs.length > 0" class="flex flex-wrap gap-2 pt-1">
                      <NuxtLink
                        v-for="ref in rec.pipelineRefs" :key="ref.id"
                        :to="`/pipeline/${ref.pipelineRun.id}`"
                        class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      >
                        {{ ref.pipelineRun.name }}
                      </NuxtLink>
                    </div>
                    <p v-else class="text-xs text-gray-400">Nepoužito v žádné pipeline</p>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <div v-if="hasMore" class="mt-4 text-center">
      <button :disabled="loading" class="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors" @click="loadMore()">
        {{ loading ? 'Načítám...' : 'Načíst další' }}
      </button>
    </div>
  </div>
</template>
