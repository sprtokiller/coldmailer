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

const DB_PAGE_SIZE = 20

type DbMode = 'text' | 'ai'
const dbMode        = ref<DbMode>('text')
const dbQuery       = ref('')
const dbResults     = ref<Array<{ id: string; canonicalName: string; type: string }>>([])
const dbLoading     = ref(false)
const dbSelectedIds = ref(new Set<string>())
const dbOffset      = ref(0)
const dbTotal       = ref(0)

const dbTotalPages = computed(() => Math.ceil(dbTotal.value / DB_PAGE_SIZE))

async function doDbSearch() {
  dbLoading.value = true
  try {
    if (dbMode.value === 'ai' && props.stepId) {
      dbResults.value = await canvas.aiSuggestRecords(props.stepId, dbQuery.value, props.stepRecordType)
      dbTotal.value = dbResults.value.length
    } else {
      type DbResp = { records: typeof dbResults.value; total: number } | typeof dbResults.value
      const resp = await $fetch<DbResp>('/api/records', {
        query: {
          search: dbQuery.value,
          limit: DB_PAGE_SIZE,
          offset: dbOffset.value,
          withCount: 'true',
          ...(props.stepRecordType ? { type: props.stepRecordType } : {}),
        },
      })
      const alreadyAdded = new Set(props.allRecords.map(r => r.globalRecord.id))
      if (resp && !Array.isArray(resp) && 'records' in resp) {
        dbResults.value = (resp.records ?? []).filter((r: { id: string }) => !alreadyAdded.has(r.id))
        dbTotal.value = resp.total ?? 0
      } else {
        dbResults.value = (resp as typeof dbResults.value).filter(r => !alreadyAdded.has(r.id))
        dbTotal.value = dbResults.value.length
      }
    }
  } finally {
    dbLoading.value = false
  }
}

function dbSelectAll() {
  const s = new Set(dbSelectedIds.value)
  for (const r of dbResults.value) s.add(r.id)
  dbSelectedIds.value = s
}

function dbDeselectAll() {
  dbSelectedIds.value = new Set()
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

function toggleDbSelect(id: string) {
  const s = new Set(dbSelectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  dbSelectedIds.value = s
}

async function addSingle(id: string) {
  if (!props.stepId) return
  await canvas.addFromGlobalDB(props.stepId, id)
  dbResults.value = dbResults.value.filter(r => r.id !== id)
}

async function addDbSelected() {
  if (!props.stepId) return
  for (const id of dbSelectedIds.value) await canvas.addFromGlobalDB(props.stepId, id)
  dbSelectedIds.value = new Set()
  emit('close')
}

onMounted(() => doDbSearch())
</script>

<template>
  <div class="bg-indigo-50/20">
    <!-- Search + AI toggle -->
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
    <!-- Info row + select all -->
    <div class="px-5 pb-1 flex items-center justify-between">
      <p v-if="dbTotal > 0" class="text-xs text-gray-400">{{ dbTotal }} v databázi · {{ allRecords.length }} přidáno</p>
      <p v-else class="text-xs text-gray-400" />
      <div v-if="dbResults.length > 0" class="flex gap-2">
        <button class="text-xs text-indigo-600 hover:underline" @click="dbSelectAll()">Vybrat vše</button>
        <button v-if="dbSelectedIds.size > 0" class="text-xs text-gray-400 hover:underline" @click="dbDeselectAll()">Zrušit</button>
      </div>
    </div>
    <p v-if="dbMode === 'ai'" class="px-5 pb-2 text-xs text-gray-400">AI prohledá záznamy napříč ostatními pipeline</p>
    <!-- Results list -->
    <div class="max-h-52 overflow-y-auto border-t border-gray-100 divide-y divide-gray-50">
      <div v-if="dbLoading" class="px-5 py-3 text-xs text-gray-400">Hledám...</div>
      <template v-else>
        <div
          v-for="rec in dbResults"
          :key="rec.id"
          class="px-5 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors"
          @click="toggleDbSelect(rec.id)"
        >
          <input type="checkbox" :checked="dbSelectedIds.has(rec.id)" class="rounded flex-shrink-0" @click.stop="toggleDbSelect(rec.id)" />
          <span class="text-sm text-gray-800 flex-1 truncate">{{ rec.canonicalName }}</span>
        </div>
        <div v-if="dbResults.length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">Nic nenalezeno.</div>
      </template>
    </div>
    <!-- Pagination -->
    <div v-if="dbTotalPages > 1" class="px-5 py-2 flex items-center justify-between border-t border-gray-100">
      <button :disabled="dbOffset === 0" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbPrevPage()">← Předchozí</button>
      <span class="text-xs text-gray-400">{{ Math.floor(dbOffset / DB_PAGE_SIZE) + 1 }} / {{ dbTotalPages }}</span>
      <button :disabled="dbOffset + DB_PAGE_SIZE >= dbTotal" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbNextPage()">Další →</button>
    </div>
    <!-- Add selected -->
    <div v-if="dbSelectedIds.size > 0" class="px-5 py-2.5 border-t border-gray-100">
      <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="addDbSelected()">
        Přidat vybrané ({{ dbSelectedIds.size }})
      </button>
    </div>
  </div>
</template>
