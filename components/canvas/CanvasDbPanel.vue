<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'
import type { StepRecord } from '~/composables/usePipelineCanvas'

const props = defineProps<{
  stepId: string | null
  stepRecordType?: string
  allRecords: StepRecord[]
}>()

const emit = defineEmits<{ close: [] }>()

const canvas = inject(canvasKey)!

// Map globalRecord.id → StepRecord for records already in this step from DB source
const addedDbMap = computed(() => {
  const map = new Map<string, StepRecord>()
  for (const r of props.allRecords) {
    if (r.inputSource?.type === 'GLOBAL_DB_SELECT') map.set(r.globalRecord.id, r)
  }
  return map
})

// ── Filter ─────────────────────────────────────────────────────────────────────
type ViewFilter = 'all' | 'selected' | 'unselected'
const viewFilter = ref<ViewFilter>('all')

// ── DB search ──────────────────────────────────────────────────────────────────
const DB_PAGE_SIZE = 20
type DbMode = 'text' | 'ai'
const dbMode        = ref<DbMode>('text')
const dbQuery       = ref('')
const dbResults     = ref<Array<{ id: string; canonicalName: string; type: string }>>([])
const dbLoading     = ref(false)
const dbOffset      = ref(0)
const dbTotal       = ref(0)

const dbTotalPages = computed(() => Math.ceil(dbTotal.value / DB_PAGE_SIZE))

// Pending adds (records not yet in step, selected by checkbox)
const pendingIds = ref(new Set<string>())

// Display-format list of records already in step (always shown regardless of search)
const addedDbList = computed(() =>
  [...addedDbMap.value.values()].map(r => ({
    id: r.globalRecord.id,
    canonicalName: r.globalRecord.canonicalName,
    type: r.globalRecord.type,
  }))
)

// Visible list after applying filter.
// addedDbList and dbResults are disjoint: server excludes all step records from the search.
const visibleResults = computed(() => {
  if (viewFilter.value === 'selected')   return addedDbList.value
  if (viewFilter.value === 'unselected') return dbResults.value
  return [...addedDbList.value, ...dbResults.value]
})

async function doDbSearch() {
  dbLoading.value = true
  try {
    if (dbMode.value === 'ai' && props.stepId) {
      dbResults.value = await canvas.aiSuggestRecords(props.stepId, dbQuery.value, props.stepRecordType)
      dbTotal.value = dbResults.value.length
    } else {
      type DbResp = { records: typeof dbResults.value; total: number }
      const resp = await $fetch<DbResp>('/api/records', {
        query: {
          search: dbQuery.value,
          limit: DB_PAGE_SIZE,
          offset: dbOffset.value,
          withCount: 'true',
          ...(props.stepRecordType ? { type: props.stepRecordType } : {}),
          ...(props.stepId ? { excludeStepId: props.stepId } : {}),
        },
      })
      dbResults.value = resp.records ?? []
      dbTotal.value = resp.total ?? 0
    }
  } finally {
    dbLoading.value = false
  }
}

async function handleDbInput() {
  if (dbMode.value !== 'text') return
  dbOffset.value = 0
  await doDbSearch()
}

function dbPrevPage() {
  if (dbOffset.value === 0) return
  dbOffset.value = Math.max(0, dbOffset.value - DB_PAGE_SIZE)
  doDbSearch()
}

function dbNextPage() {
  if (dbOffset.value + DB_PAGE_SIZE >= dbTotal.value) return
  dbOffset.value += DB_PAGE_SIZE
  doDbSearch()
}

// Clicking a row: toggle existing ref OR stage for add
async function handleClick(r: { id: string }) {
  const existing = addedDbMap.value.get(r.id)
  if (existing) {
    if (!props.stepId) return
    await canvas.toggleSelection(existing.id, !existing.isSelectedForProcessing, props.stepId)
  } else {
    const s = new Set(pendingIds.value)
    s.has(r.id) ? s.delete(r.id) : s.add(r.id)
    pendingIds.value = s
  }
}

function isChecked(r: { id: string }): boolean {
  const existing = addedDbMap.value.get(r.id)
  if (existing) return existing.isSelectedForProcessing
  return pendingIds.value.has(r.id)
}

async function addPending() {
  if (!props.stepId) {
    // Short pipeline: PI step doesn't exist yet — create it on-demand for each record
    for (const id of pendingIds.value) await canvas.ensurePartnerImported(id)
    pendingIds.value = new Set()
    emit('close')
    return
  }
  for (const id of pendingIds.value) await canvas.addFromGlobalDB(props.stepId, id)
  pendingIds.value = new Set()
  emit('close')
}

function selectAllVisible(val: boolean) {
  const newPending = new Set(pendingIds.value)
  for (const r of visibleResults.value) {
    const existing = addedDbMap.value.get(r.id)
    if (existing) canvas.toggleSelection(existing.id, val, props.stepId!)
    else val ? newPending.add(r.id) : newPending.delete(r.id)
  }
  pendingIds.value = newPending
}

onMounted(() => doDbSearch())
</script>

<template>
  <div class="bg-indigo-50/20">
    <!-- Search bar -->
    <div class="px-5 pt-3 pb-2 flex items-center gap-2">
      <input
        v-model="dbQuery"
        type="text"
        :placeholder="dbMode === 'ai' ? 'Popište, co hledáte...' : 'Textové vyhledání...'"
        class="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
        @input="handleDbInput()"
        @keyup.enter="doDbSearch()"
      />
      <button
        :class="['text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors', dbMode === 'ai' ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600']"
        @click="dbMode = dbMode === 'ai' ? 'text' : 'ai'; dbResults = []"
      >AI</button>
      <button
        v-if="dbMode === 'ai'"
        :disabled="dbLoading || !dbQuery.trim()"
        class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        @click="doDbSearch()"
      >{{ dbLoading ? '...' : 'Hledat' }}</button>
    </div>
    <p v-if="dbMode === 'ai'" class="px-5 pb-2 text-xs text-gray-400">AI prohledá záznamy napříč ostatními pipeline</p>

    <!-- Filter tabs + select all -->
    <div class="px-5 pb-2 flex items-center justify-between gap-3">
      <div class="flex gap-1">
        <button
          :class="['text-xs px-2.5 py-1 rounded-md transition-colors', viewFilter === 'selected' ? 'bg-rose-100 text-rose-700 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100']"
          @click="viewFilter = viewFilter === 'selected' ? 'all' : 'selected'"
        >Vybrané</button>
        <button
          :class="['text-xs px-2.5 py-1 rounded-md transition-colors', viewFilter === 'unselected' ? 'bg-rose-100 text-rose-700 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100']"
          @click="viewFilter = viewFilter === 'unselected' ? 'all' : 'unselected'"
        >Nevybrané</button>
      </div>
      <div v-if="visibleResults.length > 0" class="flex gap-2">
        <button class="text-xs text-indigo-600 hover:underline" @click="selectAllVisible(true)">Vybrat vše</button>
        <button class="text-xs text-gray-400 hover:underline" @click="selectAllVisible(false)">Zrušit vše</button>
      </div>
    </div>

    <!-- Unified results list -->
    <div class="max-h-52 overflow-y-auto border-t border-gray-100 divide-y divide-gray-50">
      <div v-if="dbLoading" class="px-5 py-3 text-xs text-gray-400">Hledám...</div>
      <template v-else>
        <div
          v-for="rec in visibleResults"
          :key="rec.id"
          class="px-5 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors"
          @click="handleClick(rec)"
        >
          <input type="checkbox" :checked="isChecked(rec)" class="rounded flex-shrink-0" @click.stop="handleClick(rec)" />
          <span class="text-sm flex-1 truncate" :class="addedDbMap.has(rec.id) ? 'text-gray-800' : 'text-gray-600'">{{ rec.canonicalName }}</span>
        </div>
        <div v-if="visibleResults.length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">Nic nenalezeno.</div>
      </template>
    </div>

    <!-- Pagination -->
    <div v-if="dbTotalPages > 1" class="px-5 py-2 flex items-center justify-between border-t border-gray-100">
      <button :disabled="dbOffset === 0" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbPrevPage()">← Předchozí</button>
      <span class="text-xs text-gray-400">{{ Math.floor(dbOffset / DB_PAGE_SIZE) + 1 }} / {{ dbTotalPages }}</span>
      <button :disabled="dbOffset + DB_PAGE_SIZE >= dbTotal" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbNextPage()">Další →</button>
    </div>

    <!-- Add pending -->
    <div v-if="pendingIds.size > 0" class="px-5 py-2.5 border-t border-gray-100">
      <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="addPending()">
        Přidat vybrané ({{ pendingIds.size }})
      </button>
    </div>
  </div>
</template>
