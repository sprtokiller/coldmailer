<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'

const props = defineProps<{
  stepId: string | null
  stepType: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const canvas = inject(canvasKey)!

const importText    = ref('')
const importLoading = ref(false)
const importError   = ref('')

async function doImport() {
  if (!importText.value.trim() || !props.stepType) return
  importLoading.value = true
  importError.value = ''
  try {
    await canvas.importAI(props.stepId ?? '', props.stepType, importText.value)
    importText.value = ''
    emit('close')
  } catch (e: unknown) {
    importError.value = (e as { message?: string })?.message ?? 'Chyba importu'
  } finally {
    importLoading.value = false
  }
}
</script>

<template>
  <div class="px-5 py-4 bg-purple-50/40">
    <textarea
      v-model="importText"
      rows="6"
      placeholder="Vložte JSON nebo text k parsování..."
      class="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-purple-300 font-mono bg-white"
    />
    <p class="text-[10px] text-gray-400 mt-1.5">
      <template v-if="stepType === 'MARKET_SCANNING'">Očekávaný formát: [{ "name": "...", "url": "...", "type": "...", "level": "..." }] — </template>
      <template v-else-if="stepType === 'PARTNER_IDENTIFICATION'">Očekávaný formát: { "items": [{ "itemName": "...", "partners": [{ "name": "..." }] }] } — </template>
      <template v-else-if="stepType === 'PARTNER_PROFILING'">Očekávaný formát: [{ "name": "...", "summary": "...", "contacts": [...] }] — </template>
      Textový vstup je také v pořádku, AI ho automaticky parsuje.
    </p>
    <p v-if="importError" class="text-xs text-red-500 mt-1">{{ importError }}</p>
    <div class="flex gap-2 mt-2">
      <button
        :disabled="importLoading || !importText.trim()"
        class="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        @click="doImport()"
      >{{ importLoading ? 'Importuji...' : 'Importovat' }}</button>
      <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="emit('close')">Zrušit</button>
    </div>
  </div>
</template>
