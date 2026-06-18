<script setup lang="ts">
import { pipelineRunKey, type usePipelineRunPage } from '~/composables/usePipelineRunPage'
import type { RecordProfilesResponse } from '~/composables/pipeline/types'

const props = defineProps<{
  globalRecordId: string
  partnerName: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

type ProfileOption = {
  key: string
  title: string
  meta: string
  date: string
  data: Record<string, unknown>
}

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const loading = ref(true)
const importing = ref(false)
const error = ref<string | null>(null)
const response = ref<RecordProfilesResponse | null>(null)
const selectedKeys = ref<Record<string, boolean>>({})

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date)
}

function contactsCount(data: Record<string, unknown>): number {
  return Array.isArray(data.contacts) ? data.contacts.length : 0
}

function stringField(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const options = computed<ProfileOption[]>(() => {
  const res = response.value
  if (!res) return []

  const current: ProfileOption[] = res.current
    ? [{
        key: 'current',
        title: 'Aktuální (global)',
        meta: 'Poslední sloučená profilace',
        date: formatDate(res.current.updatedAt),
        data: res.current.data,
      }]
    : []

  const historical = res.historical.map((profile, index) => ({
    key: `historical:${profile.stepId}:${index}`,
    title: profile.pipelineRunName,
    meta: profile.runnerName ? `Runner: ${profile.runnerName}` : 'Historická profilace',
    date: formatDate(profile.completedAt),
    data: profile.data,
  }))

  return [...current, ...historical]
})

const selectedProfiles = computed(() =>
  [...options.value]
    .reverse()
    .filter(option => selectedKeys.value[option.key])
    .map(option => option.data),
)

async function loadProfiles() {
  loading.value = true
  error.value = null
  try {
    response.value = await $fetch<RecordProfilesResponse>(`/api/records/${props.globalRecordId}/profiles`)
    const firstKey = options.value[0]?.key
    selectedKeys.value = firstKey ? { [firstKey]: true } : {}
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Profilace se nepodařilo načíst.'
  } finally {
    loading.value = false
  }
}

async function importSelected() {
  if (selectedProfiles.value.length === 0 || importing.value) return
  importing.value = true
  error.value = null
  try {
    await pipeline.importProfiles(selectedProfiles.value)
    emit('imported')
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Profilace se nepodařilo importovat.'
  } finally {
    importing.value = false
  }
}

onMounted(loadProfiles)
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold text-gray-800">{{ partnerName }}</h3>
            <p class="mt-0.5 text-xs text-gray-400">Dostupné uložené profilace</p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-50 hover:text-gray-500"
            title="Zavřít"
            @click="emit('close')"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="max-h-[65vh] overflow-y-auto px-5 py-4">
          <div v-if="loading" class="py-8 text-center text-xs text-gray-400">
            Načítám profilace...
          </div>

          <div v-else-if="error" class="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {{ error }}
          </div>

          <div v-else-if="options.length === 0" class="py-8 text-center text-xs text-gray-400">
            Pro tohoto partnera nejsou uložené žádné profilace.
          </div>

          <div v-else class="space-y-2">
            <label
              v-for="option in options"
              :key="option.key"
              class="grid cursor-pointer grid-cols-[1.25rem_1fr] gap-3 rounded-lg border border-gray-100 px-3 py-3 hover:bg-gray-50/70"
              :class="selectedKeys[option.key] ? 'border-primary/30 bg-primary/5' : ''"
            >
              <input
                v-model="selectedKeys[option.key]"
                type="checkbox"
                class="mt-0.5 accent-primary"
              />
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="text-xs font-semibold text-gray-800">{{ option.title }}</span>
                  <span class="text-[11px] text-gray-400">{{ option.date }}</span>
                </span>
                <span class="mt-0.5 block text-[11px] text-gray-400">{{ option.meta }}</span>
                <span class="mt-2 grid gap-1 text-[11px] text-gray-500 sm:grid-cols-3">
                  <span class="truncate">
                    <span class="text-gray-400">Industry:</span>
                    {{ stringField(option.data, ['industry']) || 'neuvedeno' }}
                  </span>
                  <span>
                    <span class="text-gray-400">Kontakty:</span>
                    {{ contactsCount(option.data) }}
                  </span>
                  <span class="truncate">
                    <span class="text-gray-400">Web:</span>
                    {{ stringField(option.data, ['website', 'url', 'web']) || 'neuvedeno' }}
                  </span>
                </span>
              </span>
            </label>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            class="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600"
            @click="emit('close')"
          >
            Zrušit
          </button>
          <button
            type="button"
            class="rounded bg-primary px-4 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="selectedProfiles.length === 0 || importing || loading"
            @click="importSelected"
          >
            {{ importing ? 'Importuji...' : 'Importovat' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
