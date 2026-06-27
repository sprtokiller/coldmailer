<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'

const props = defineProps<{
  stepId: string | null
  stepType: string | null
  prefill?: string
}>()

const emit = defineEmits<{ close: []; consumed: [] }>()

const canvas = inject(canvasKey)!

const importText    = ref('')
const importLoading = ref(false)
const importError   = ref('')
const showPartnerModal = ref(false)

async function onPartnerSaved(result: { id: string }) {
  await canvas.ensurePartnerImported(result.id)
  showPartnerModal.value = false
}

const FORMAT_HINTS: Record<string, { json: string; text?: string }> = {
  MARKET_SCANNING:        { json: '[{ "name": "...", "url": "..." }]' },
  PARTNER_IDENTIFICATION: {
    json: '[{ "itemName": "...", "partners": [{ "name": "..." }] }]',
    text: 'Nebo vložte textový popis, např.:\nSoutěž Zlatý Ámos — partneři: Česká spořitelna (generální partner), T-Mobile (mediální partner), Deloitte (odborný partner).\nHackathon Junction Prague — partneři: Microsoft, JetBrains (technologický partner), PwC.',
  },
  PARTNER_PROFILING:      {
    json: '[{ "name": "...", "summary": "..." }]',
    text: 'Nebo vložte textový popis, např.:\nFirma XY, s.r.o. — technologická firma z Prahy, ~50 zaměstnanců. Zaměřuje se na IoT řešení pro průmysl. Kontakt: Jan Novák, PR manažer, jan@firmaxy.cz. Partnerství: generální partner konference Smart Industry 2025.',
  },
}

const placeholder = computed(() => {
  const hint = props.stepType ? FORMAT_HINTS[props.stepType] : undefined
  if (!hint) return 'Vložte JSON nebo text k parsování...'
  const base = `Vložte JSON (např. ${hint.json}) nebo text k parsování...`
  return hint.text ? `${base}\n\n${hint.text}` : base
})

onMounted(() => {
  if (props.prefill) {
    importText.value = props.prefill
    emit('consumed')
  }
})

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
  <div class="px-5 py-4 bg-emerald-50/40">
    <textarea
      v-model="importText"
      rows="6"
      :placeholder="placeholder"
      class="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-emerald-300 font-mono bg-white"
    />
    <p class="text-[10px] text-gray-400 mt-1.5">Textový vstup je také v pořádku, AI ho automaticky parsuje.</p>
    <p v-if="importError" class="text-xs text-red-500 mt-1">{{ importError }}</p>
    <div class="flex gap-2 mt-2">
      <button
        :disabled="importLoading || !importText.trim()"
        class="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        @click="doImport()"
      >{{ importLoading ? 'Importuji...' : 'Importovat' }}</button>
      <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="emit('close')">Zrušit</button>
      <button
        v-if="stepType === 'PARTNER_IDENTIFICATION'"
        class="text-xs px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors ml-auto"
        @click="showPartnerModal = true"
      >+ Vyplnit manuálně</button>
    </div>
    <PartnersPartnerFormModal
      v-if="showPartnerModal"
      mode="create"
      duplicate-behavior="use-existing"
      @close="showPartnerModal = false"
      @saved="onPartnerSaved"
    />
  </div>
</template>
