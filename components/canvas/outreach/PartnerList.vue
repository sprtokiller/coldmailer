<script setup lang="ts">
import { outreachWorkspaceKey } from '~/composables/canvas/useOutreachWorkspace'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import { normalizeKey } from '~/composables/pipeline/useSelectionState'

const workspace = inject(outreachWorkspaceKey)!

const pipeline = inject(pipelineRunKey) as PipelineRunContext

const emailMap = computed(() => {
  const map = new Map<string, { draft: boolean; saved: boolean; sent: boolean; partnerId?: string }>()
  for (const e of pipeline.outreachEmails()) {
    if (e.error) continue
    const key = normalizeKey(e.partnerName ?? e.name)
    map.set(key, {
      draft: true,
      saved: !!e.savedAt,
      sent: !!e.sentAt,
      partnerId: e.partnerId as string | undefined,
    })
  }
  return map
})

function getTag(name: string): 'sent' | 'saved' | 'draft' | null {
  const entry = emailMap.value.get(normalizeKey(name))
  if (!entry) return null
  if (entry.sent) return 'sent'
  if (entry.saved) return 'saved'
  return 'draft'
}

const alignments = computed(() => {
  const data = pipeline.alignmentOutputAlignments('VALUE_ALIGNMENT')
  return data
    .filter((a: Record<string, unknown>) => (a.name || a.partnerName) && !a.error)
    .map((a: Record<string, unknown>, idx: number) => ({
      name: String(a.name ?? a.partnerName ?? ''),
      originalIndex: idx,
    }))
})

const sortedPartners = computed(() => {
  const q = workspace.partnerSearch.value.toLowerCase()
  const visible: typeof alignments.value = []
  const hidden: typeof alignments.value = []

  for (const p of alignments.value) {
    if (q && !p.name.toLowerCase().includes(q)) continue
    if (workspace.hiddenPartners.value.has(p.name)) {
      hidden.push(p)
    } else {
      visible.push(p)
    }
  }

  return [...visible, ...hidden]
})

function toggleVisibility(name: string) {
  const s = new Set(workspace.hiddenPartners.value)
  if (s.has(name)) {
    s.delete(name)
  } else {
    s.add(name)
  }
  workspace.hiddenPartners.value = s
}

function selectPartner(name: string) {
  workspace.selectedPartner.value = name
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-3 border-b border-gray-100">
      <input
        v-model="workspace.partnerSearch.value"
        type="text"
        placeholder="Hledat partnera..."
        class="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-for="p in sortedPartners"
        :key="p.name"
        class="flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors"
        :class="[
          workspace.selectedPartner.value === p.name
            ? 'bg-indigo-50 border-l-indigo-500'
            : 'border-l-transparent hover:bg-gray-50',
          workspace.hiddenPartners.value.has(p.name) ? 'opacity-50' : '',
        ]"
        @click="selectPartner(p.name)"
      >
        <!-- Eye icon -->
        <button
          type="button"
          class="shrink-0 w-5 h-5 flex items-center justify-center transition-colors"
          :class="workspace.hiddenPartners.value.has(p.name) ? 'text-gray-300' : 'text-gray-400 hover:text-gray-600'"
          @click.stop="toggleVisibility(p.name)"
        >
          <!-- Open eye -->
          <svg v-if="!workspace.hiddenPartners.value.has(p.name)" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <!-- Crossed-out eye -->
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
          </svg>
        </button>

        <!-- Tag -->
        <NuxtLink
          v-if="getTag(p.name) === 'sent' && emailMap.get(normalizeKey(p.name))?.partnerId"
          :to="`/partners/${emailMap.get(normalizeKey(p.name))!.partnerId}`"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
          title="Zobrazit plnění partnera"
          @click.stop
        >Odesláno →</NuxtLink>
        <span
          v-else-if="getTag(p.name) === 'sent'"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600"
        >Odesláno</span>
        <span
          v-else-if="getTag(p.name) === 'saved'"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-600"
        >Uloženo</span>
        <span
          v-else-if="getTag(p.name) === 'draft'"
          class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-600"
        >Koncept</span>

        <!-- Name -->
        <span
          class="text-sm truncate min-w-0"
          :class="workspace.hiddenPartners.value.has(p.name) ? 'text-gray-400' : 'text-gray-800'"
          :title="p.name"
        >{{ p.name }}</span>
      </div>

      <div v-if="sortedPartners.length === 0" class="px-3 py-6 text-center text-xs text-gray-400">
        {{ workspace.partnerSearch.value ? 'Žádná shoda' : 'Nejprve spusťte Krok 4 (Value Alignment)' }}
      </div>
    </div>
  </div>
</template>
