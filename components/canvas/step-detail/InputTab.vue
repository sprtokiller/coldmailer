<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { getStr } from '~/composables/canvas/useOverlayCore'
const o = inject(overlayKey)!
const { stepType, s4Partners, s5Alignments, s6Emails, oeResult,
  pl, isProcessed, partnerRunCount, toggleS4, toggleS5 } = o
</script>

<template>
  <!-- PI (step 2): MS record selection -->
  <CanvasStepDetailInputTabPi v-if="stepType === 'PARTNER_IDENTIFICATION'" />

  <!-- VA (step 4): profiled partner selection -->
  <template v-else-if="stepType === 'VALUE_ALIGNMENT'">
    <CanvasEmptyState
      v-if="s4Partners.length === 0"
      message="Krok 3 zatím nemá žádné profily."
    />
    <div v-else>
      <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <span class="text-xs text-gray-500"><span class="font-semibold text-gray-800">{{ pl?.step4SelectedCount?.() ?? 0 }}</span> z {{ s4Partners.length }} vybráno</span>
        <div class="flex gap-2">
          <button class="text-xs text-indigo-600 hover:underline" @click="pl?.step4SelectAll?.()">Vybrat vše</button>
          <button class="text-xs text-gray-500 hover:underline" @click="pl?.step4SelectUnprocessed?.()">Jen nezpracované</button>
          <button class="text-xs text-gray-400 hover:underline" @click="pl?.step4DeselectAll?.()">Zrušit vše</button>
        </div>
      </div>
      <div class="divide-y divide-gray-50">
        <div v-for="p in s4Partners" :key="p.name" class="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
          <input type="checkbox" :checked="pl?.step4SelectedIds?.[p.name] ?? false" class="mt-0.5 rounded flex-shrink-0"
            @change="toggleS4(p.name, ($event.target as HTMLInputElement).checked)" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span v-if="isProcessed(p.name)" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Hotovo</span>
              <span :class="['text-sm font-medium', isProcessed(p.name) ? 'text-green-800' : 'text-gray-800']">{{ p.name }}</span>
              <span v-if="p.industry" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ p.industry }}</span>
              <span v-if="partnerRunCount(p.name) > 1" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ partnerRunCount(p.name) }}× pipeline</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
              <a v-if="p.website" :href="p.website" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
              <a v-if="p.linkedinUrl" :href="p.linkedinUrl" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>in LinkedIn</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- OP (step 5): alignment selection -->
  <template v-else-if="stepType === 'OUTREACH_PREPARATION'">
    <CanvasEmptyState
      v-if="s5Alignments.length === 0"
      message="Krok 4 zatím nemá žádné alignmenty."
    />
    <div v-else>
      <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <span class="text-xs text-gray-500"><span class="font-semibold text-gray-800">{{ pl?.step5SelectedCount?.() ?? 0 }}</span> z {{ s5Alignments.length }} vybráno</span>
        <div class="flex gap-2">
          <button class="text-xs text-indigo-600 hover:underline" @click="pl?.step5SelectAll?.()">Vybrat vše</button>
          <button class="text-xs text-gray-500 hover:underline" @click="pl?.step5SelectUnprocessed?.()">Jen nezpracované</button>
          <button class="text-xs text-gray-400 hover:underline" @click="pl?.step5DeselectAll?.()">Zrušit vše</button>
        </div>
      </div>
      <div class="divide-y divide-gray-50">
        <div v-for="a in s5Alignments" :key="getStr(a, 'name') || getStr(a, 'partnerName')"
          class="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
          <input type="checkbox"
            :checked="pl?.step5SelectedIds?.[getStr(a, 'name') || getStr(a, 'partnerName')] ?? false"
            class="mt-0.5 rounded flex-shrink-0"
            @change="toggleS5(getStr(a, 'name') || getStr(a, 'partnerName'), ($event.target as HTMLInputElement).checked)" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span v-if="isProcessed(getStr(a, 'name') || getStr(a, 'partnerName'))" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Hotovo</span>
              <span :class="['text-sm font-medium', isProcessed(getStr(a, 'name') || getStr(a, 'partnerName')) ? 'text-green-800' : 'text-gray-800']">{{ getStr(a, 'name') || getStr(a, 'partnerName') }}</span>
              <span v-if="partnerRunCount(getStr(a, 'name') || getStr(a, 'partnerName')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ partnerRunCount(getStr(a, 'name') || getStr(a, 'partnerName')) }}× pipeline</span>
            </div>
            <p v-if="getStr(a, 'hookHypothesis')" class="text-xs text-gray-500 mt-0.5 line-clamp-1 italic">{{ getStr(a, 'hookHypothesis') }}</p>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- OE (step 6): prepared emails overview -->
  <template v-else-if="stepType === 'OUTREACH_EXECUTION'">
    <CanvasEmptyState v-if="s6Emails.length === 0" message="Krok 5 zatím nemá žádné e-maily." />
    <div v-else>
      <div class="px-5 py-2.5 border-b border-gray-100">
        <span class="text-xs text-gray-500">{{ s6Emails.length }} {{ s6Emails.length === 1 ? 'e-mail' : 'e-mailů' }} připraveno k odeslání</span>
      </div>
      <div class="divide-y divide-gray-50">
        <div v-for="(email, i) in s6Emails" :key="i" class="px-5 py-3 hover:bg-gray-50 transition-colors">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span :class="['text-sm font-medium', oeResult ? 'text-green-800' : 'text-gray-800']">{{ getStr(email, 'partnerName') || getStr(email, 'name') }}</span>
            <span v-if="oeResult" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Odesláno</span>
          </div>
        </div>
      </div>
      <p class="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">Příjemce a odeslání nastavte v záložce Konfigurace.</p>
    </div>
  </template>
</template>
