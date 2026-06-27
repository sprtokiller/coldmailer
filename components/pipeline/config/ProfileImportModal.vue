<script setup lang="ts">
import { pipelineRunKey, type usePipelineRunPage } from '~/composables/usePipelineRunPage'

const props = defineProps<{
  globalRecordId: string
  partnerName: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

const pipeline = inject(pipelineRunKey) as Awaited<ReturnType<typeof usePipelineRunPage>>

const importText = ref('')
const importing = ref(false)
const error = ref<string | null>(null)

const placeholder = `Vložte JSON profilu (např. { "name": "...", "summary": "...", "contacts": [...] })

Nebo textový popis, např.:
Firma XY, s.r.o. — technologická firma z Prahy, ~50 zaměstnanců. Zaměřuje se na IoT řešení pro průmysl. Kontakt: Jan Novák, PR manažer, jan@firmaxy.cz.`

async function importProfile() {
  if (!importText.value.trim() || importing.value) return
  importing.value = true
  error.value = null
  try {
    await pipeline.importProfileForPartner(props.globalRecordId, props.partnerName, importText.value)
    emit('imported')
    emit('close')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? (err instanceof Error ? err.message : 'Profil se nepodařilo importovat.')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div class="min-w-0">
            <h3 class="truncate text-sm font-semibold text-gray-800">{{ partnerName }}</h3>
            <p class="mt-0.5 text-xs text-gray-400">Nahrát profil (JSON nebo text)</p>
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

        <div class="px-5 py-4">
          <textarea
            v-model="importText"
            rows="10"
            :placeholder="placeholder"
            class="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
          />
          <p class="mt-1.5 text-[10px] text-gray-400">Textový vstup je také v pořádku, AI ho automaticky parsuje.</p>
          <p v-if="error" class="mt-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {{ error }}
          </p>
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
            :disabled="!importText.trim() || importing"
            @click="importProfile"
          >
            {{ importing ? 'Importuji...' : 'Importovat' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
