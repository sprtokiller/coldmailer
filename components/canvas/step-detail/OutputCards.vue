<script setup lang="ts">
import { overlayKey } from '~/composables/canvas/useOverlay'
import { getStr, getArr, getObj, renderLinks, CONTACT_TYPE_COLORS, CONFIDENCE_COLORS, SIZE_LABELS } from '~/composables/canvas/useOverlayCore'
const o = inject(overlayKey)!
const { stepType, ppProfiles, vaAlignments, opEmails, oeResult, expandedCardIdx, toggleCard, partnerRunCount } = o
</script>

<template>
  <!-- PARTNER_PROFILING -->
  <div v-if="stepType === 'PARTNER_PROFILING'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
    <CanvasEmptyState v-if="ppProfiles.length === 0" message="Žádné profily. Spusťte krok nebo importujte data." />
    <div v-for="(profile, i) in ppProfiles" :key="i" class="p-5">
      <div class="flex items-start gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {{ getStr(profile, 'name') }}
            </span>
            <span v-if="getStr(profile, 'industry')" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ getStr(profile, 'industry') }}</span>
            <span v-if="getStr(profile, 'size')" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ SIZE_LABELS[getStr(profile, 'size')] ?? getStr(profile, 'size') }}</span>
            <span v-if="partnerRunCount(getStr(profile, 'name')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(profile, 'name')) }}× pipeline</span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <a v-if="getStr(profile, 'website')" :href="getStr(profile, 'website')" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
            <a v-if="getStr(profile, 'linkedinUrl')" :href="getStr(profile, 'linkedinUrl')" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>in LinkedIn</a>
          </div>
        </div>
        <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
      </div>
      <p v-if="getStr(profile, 'summary')" :class="['text-xs text-gray-600 leading-relaxed mb-2', expandedCardIdx !== i ? 'line-clamp-2' : '']" v-html="renderLinks(getStr(profile, 'summary'))" />
      <template v-if="expandedCardIdx === i">
        <div v-if="getArr(profile, 'contacts').length > 0" class="mb-2">
          <div class="text-xs font-medium text-gray-400 mb-1">Kontakty</div>
          <div class="space-y-1">
            <div v-for="(contact, ci) in getArr(profile, 'contacts').slice(0, 50)" :key="ci" class="flex items-center gap-1.5 text-xs">
              <span :class="['px-1.5 py-0.5 rounded flex-shrink-0 text-xs', CONTACT_TYPE_COLORS[getStr(contact, 'type')] ?? 'bg-gray-100 text-gray-500']">{{ getStr(contact, 'type') }}</span>
              <span class="font-medium text-gray-700 truncate">{{ [getStr(contact, 'firstName'), getStr(contact, 'lastName')].filter(Boolean).join(' ') || getStr(contact, 'role') }}</span>
              <span v-if="getStr(contact, 'role') && (getStr(contact, 'firstName') || getStr(contact, 'lastName'))" class="text-gray-400 truncate">{{ getStr(contact, 'role') }}</span>
              <a v-if="getStr(contact, 'email')" :href="`mailto:${getStr(contact, 'email')}`" class="text-indigo-500 hover:underline ml-auto flex-shrink-0">{{ getStr(contact, 'email') }}</a>
              <span :class="['flex-shrink-0', CONFIDENCE_COLORS[getStr(contact, 'confidence')] ?? 'text-gray-400']">{{ getStr(contact, 'confidence') }}</span>
            </div>
          </div>
        </div>
        <div v-if="getArr(profile, 'partnershipEvidence').length > 0" class="mb-2">
          <div class="text-xs font-medium text-gray-400 mb-1">Partnerství</div>
          <div class="flex flex-wrap gap-1">
            <span v-for="(ev, ei) in getArr(profile, 'partnershipEvidence')" :key="ei" class="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{{ getStr(ev, 'event') }}<span v-if="getStr(ev, 'year')"> ({{ getStr(ev, 'year') }})</span></span>
          </div>
        </div>
        <div v-if="getArr(profile, 'recentHighlights').length > 0" class="mb-2">
          <div class="text-xs font-medium text-gray-400 mb-1">Novinky</div>
          <ul class="space-y-0.5 text-xs text-gray-500 list-disc list-inside"><li v-for="(hl, hi) in getArr(profile, 'recentHighlights')" :key="hi" v-html="renderLinks(String(hl))" /></ul>
        </div>
        <p v-if="getStr(profile, 'activities')" class="text-xs text-gray-500 mb-2" v-html="renderLinks(getStr(profile, 'activities'))" />
        <p v-if="getStr(profile, 'researchNotes')" class="text-xs text-gray-400 italic" v-html="'Poznámky: ' + renderLinks(getStr(profile, 'researchNotes'))" />
      </template>
      <div v-if="getArr(profile, 'partnershipStyle').length > 0 && expandedCardIdx !== i" class="flex flex-wrap gap-1">
        <span v-for="(style, si) in getArr(profile, 'partnershipStyle').slice(0, 3)" :key="si" class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">{{ style }}</span>
      </div>
    </div>
  </div>

  <!-- VALUE_ALIGNMENT -->
  <div v-else-if="stepType === 'VALUE_ALIGNMENT'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
    <CanvasEmptyState v-if="vaAlignments.length === 0" message="Žádné alignmenty. Spusťte krok nebo importujte data." />
    <div v-for="(alignment, i) in vaAlignments" :key="i" class="p-5">
      <div class="flex items-start gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {{ getStr(alignment, 'name') || getStr(alignment, 'partnerName') }}
            </span>
            <span v-if="partnerRunCount(getStr(alignment, 'name') || getStr(alignment, 'partnerName')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(alignment, 'name') || getStr(alignment, 'partnerName')) }}× pipeline</span>
          </div>
        </div>
        <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
      </div>
      <div v-if="getArr(alignment, 'top3Arguments').length > 0 && expandedCardIdx !== i" class="flex flex-wrap gap-1">
        <span v-for="(arg, ai) in getArr(alignment, 'top3Arguments')" :key="ai" class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">{{ getStr(arg, 'argumentLabel') || getStr(arg, 'argumentId') }}</span>
      </div>
      <template v-if="expandedCardIdx === i">
        <p v-if="getStr(alignment, 'hookHypothesis')" class="text-xs text-indigo-700 bg-indigo-50 rounded px-3 py-2 italic leading-relaxed mb-3">{{ getStr(alignment, 'hookHypothesis') }}</p>
        <div v-if="getArr(alignment, 'top3Arguments').length > 0" class="mt-3">
          <div class="text-xs font-medium text-gray-400 mb-1.5">Top argumenty</div>
          <div class="space-y-2">
            <div v-for="(arg, ai) in getArr(alignment, 'top3Arguments')" :key="ai" class="flex gap-2 text-xs">
              <span class="font-bold text-indigo-500 flex-shrink-0 w-4">{{ getStr(arg, 'rank') }}.</span>
              <div><span class="font-medium text-gray-700">{{ getStr(arg, 'argumentLabel') || getStr(arg, 'argumentId') }}</span><p class="text-gray-500 mt-0.5 leading-relaxed">{{ getStr(arg, 'whyItFits') }}</p><p v-if="getStr(arg, 'howToFrame')" class="text-gray-400 mt-0.5 leading-relaxed">{{ getStr(arg, 'howToFrame') }}</p></div>
            </div>
          </div>
        </div>
        <p v-if="getStr(alignment, 'partnerSnapshot')" class="text-xs text-gray-500 mt-3 leading-relaxed">{{ getStr(alignment, 'partnerSnapshot') }}</p>
        <div v-if="getArr(alignment, 'argumentsToDrop').length > 0" class="mt-3">
          <div class="text-xs font-medium text-gray-400 mb-1">Argumenty k vynechání</div>
          <div class="flex flex-wrap gap-1">
            <span v-for="(drop, di) in getArr(alignment, 'argumentsToDrop')" :key="di" class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500">{{ getStr(drop, 'argumentLabel') || getStr(drop, 'argumentId') }}</span>
          </div>
        </div>
        <div v-if="getObj(getObj(alignment, 'recommendedContact'), 'primary').role" class="mt-3">
          <div class="text-xs font-medium text-gray-400 mb-1">Doporučený kontakt</div>
          <div class="text-xs text-gray-700"><span v-if="getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'name')">{{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'name') }} — </span>{{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'role') }}</div>
          <p class="text-xs text-gray-400 mt-0.5">{{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'reasoning') }}</p>
        </div>
      </template>
    </div>
  </div>

  <!-- OUTREACH_PREPARATION -->
  <div v-else-if="stepType === 'OUTREACH_PREPARATION'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
    <CanvasEmptyState v-if="opEmails.length === 0" message="Žádné e-maily. Spusťte krok nebo importujte data." />
    <div v-for="(email, i) in opEmails" :key="i" class="p-5">
      <div class="flex items-start gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="text-sm font-semibold text-gray-900">{{ getStr(email, 'partnerName') || getStr(email, 'name') }}</span>
            <span v-if="partnerRunCount(getStr(email, 'partnerName') || getStr(email, 'name')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(email, 'partnerName') || getStr(email, 'name')) }}× pipeline</span>
          </div>
          <div class="text-xs font-medium text-gray-600 bg-gray-50 px-2.5 py-1.5 rounded">Předmět: {{ getStr(getObj(email, 'email'), 'subject') }}</div>
        </div>
        <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
      </div>
      <div class="text-xs text-gray-500 bg-gray-50/60 rounded px-3 py-2 mt-2 whitespace-pre-wrap leading-relaxed" :class="expandedCardIdx !== i ? 'line-clamp-4' : ''">{{ getStr(getObj(email, 'email'), 'body') }}</div>
      <template v-if="expandedCardIdx === i">
        <div v-if="getStr(getObj(email, 'analysis'), 'recipientProfile')" class="mt-3">
          <div class="text-xs font-medium text-gray-400 mb-1">Profil příjemce</div>
          <p class="text-xs text-gray-500">{{ getStr(getObj(email, 'analysis'), 'recipientProfile') }}</p>
        </div>
      </template>
    </div>
  </div>

  <!-- OUTREACH_EXECUTION -->
  <div v-else-if="stepType === 'OUTREACH_EXECUTION'" class="flex-1 overflow-y-auto p-5">
    <CanvasEmptyState v-if="!oeResult" message="Nebyl vytvořen žádný draft. Spusťte krok." />
    <div v-else class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Draft vytvořen</span>
        <span class="text-xs text-gray-400">Gmail Draft ID: {{ getStr(oeResult, 'gmailDraftId') }}</span>
      </div>
      <div class="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
        <div><span class="text-xs text-gray-400 uppercase tracking-wide">Komu</span><p class="font-medium text-gray-800 mt-0.5">{{ getStr(oeResult, 'to') }}</p></div>
        <div><span class="text-xs text-gray-400 uppercase tracking-wide">Předmět</span><p class="font-medium text-gray-800 mt-0.5">{{ getStr(oeResult, 'subject') }}</p></div>
      </div>
      <p class="text-xs text-gray-400 text-center">Draft je dostupný v Gmail v sekci Koncepty.</p>
    </div>
  </div>
</template>
