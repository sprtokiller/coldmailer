<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface Contact { id: string; address: string; isPrimary: boolean; label: string | null }
interface AssigneeUser { id: string; name: string; image: string | null }
interface Partner {
  id: string
  canonicalName: string
  payload: Record<string, unknown>
  contacts: Contact[]
  assignees: AssigneeUser[]
  lastInteractionAt: string | null
  interactionCount: number
  dealStage: string | null
  actionStatus: string | null
}

const search = ref('')
const { data: allPartners, pending, refresh: refreshPartners } = await useFetch<Partner[]>('/api/partners')

const showSearchAssign = ref(false)

function onAssigned() {
  showSearchAssign.value = false
  refreshPartners()
}

const partners = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return allPartners.value ?? []
  return (allPartners.value ?? []).filter(p =>
    p.canonicalName.toLowerCase().includes(q),
  )
})

function primaryEmail(p: Partner) {
  return p.contacts.find(c => c.isPrimary)?.address ?? p.contacts[0]?.address ?? null
}
function lastContact(p: Partner) {
  if (!p.lastInteractionAt) return null
  return new Date(p.lastInteractionAt).toLocaleDateString('cs-CZ')
}

const DEAL_STAGE_LABELS: Record<string, string> = {
  CONTACTED: 'Osloveno',
  NEGOTIATING: 'V jednání',
  NOT_INTERESTED: 'Nezájem',
  NOT_THIS_TIME: 'Tentokrát ne',
  PARTNER: 'Partner',
  COMPLETED: 'Dokončeno',
}

const DEAL_STAGE_COLORS: Record<string, string> = {
  CONTACTED: 'bg-blue-100 text-blue-700',
  NEGOTIATING: 'bg-amber-100 text-amber-700',
  NOT_INTERESTED: 'bg-red-100 text-red-700',
  NOT_THIS_TIME: 'bg-orange-100 text-orange-700',
  PARTNER: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
}

const ACTION_STATUS_LABELS: Record<string, string> = {
  WAITING_FOR_THEM: 'Čekání na ně',
  WAITING_FOR_US: 'Čekání na nás',
  BEFORE_MEETING: 'Před schůzkou',
  NONE: 'Už nic',
}

const ACTION_STATUS_COLORS: Record<string, string> = {
  WAITING_FOR_THEM: 'bg-sky-100 text-sky-700',
  WAITING_FOR_US: 'bg-rose-100 text-rose-700',
  BEFORE_MEETING: 'bg-purple-100 text-purple-700',
  NONE: 'bg-gray-100 text-gray-500',
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Oslovení partneři</h1>
        <p class="text-sm text-gray-400 mt-1">Partneři s probíhající komunikací</p>
      </div>
      <button
        class="text-sm font-medium text-white bg-primary px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        @click="showSearchAssign = true"
      >
        Přidat partnera do projektu
      </button>
    </div>

    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Hledat partnera..."
        class="w-full max-w-sm text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
      />
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 bg-gray-50 text-left">
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Název</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Fáze</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Stav</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Primární email</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přiřazení</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Interakce</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Poslední kontakt</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="pending">
            <td colspan="7" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
          </tr>
          <tr v-else-if="!partners?.length">
            <td colspan="7" class="text-center py-12 text-gray-400 text-sm">
              {{ search ? 'Žádný partner nenalezen' : 'Zatím žádní oslovení partneři' }}
            </td>
          </tr>
          <tr
            v-for="p in partners"
            :key="p.id"
            class="hover:bg-gray-50 cursor-pointer transition-colors"
            @click="navigateTo(`/negotiations/${p.id}`)"
          >
            <td class="px-4 py-3 font-medium text-gray-800">
              <div class="flex items-center gap-2">
                <span class="truncate max-w-56">{{ p.canonicalName }}</span>
                <a
                  v-if="p.payload.website || p.payload.url"
                  :href="String(p.payload.website || p.payload.url)"
                  target="_blank"
                  rel="noopener"
                  class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0"
                  @click.stop
                >↗</a>
              </div>
              <div v-if="p.payload.summary" class="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-56">
                {{ p.payload.summary }}
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="p.dealStage"
                class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                :class="DEAL_STAGE_COLORS[p.dealStage] ?? 'bg-gray-100 text-gray-600'"
              >
                {{ DEAL_STAGE_LABELS[p.dealStage] ?? p.dealStage }}
              </span>
              <span v-else class="text-xs text-gray-300">—</span>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="p.actionStatus"
                class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                :class="ACTION_STATUS_COLORS[p.actionStatus] ?? 'bg-gray-100 text-gray-500'"
              >
                {{ ACTION_STATUS_LABELS[p.actionStatus] ?? p.actionStatus }}
              </span>
              <span v-else class="text-xs text-gray-300">—</span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600">
              <span v-if="primaryEmail(p)" class="font-mono">{{ primaryEmail(p) }}</span>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center -space-x-1">
                <template v-for="a in p.assignees.slice(0, 4)" :key="a.id">
                  <img
                    v-if="a.image"
                    :src="a.image"
                    :alt="a.name"
                    :title="a.name"
                    class="w-6 h-6 rounded-full ring-2 ring-white object-cover"
                    referrerpolicy="no-referrer"
                  />
                  <div
                    v-else
                    :title="a.name"
                    class="w-6 h-6 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-xs font-medium"
                  >
                    {{ a.name.charAt(0).toUpperCase() }}
                  </div>
                </template>
                <span v-if="p.assignees.length > 4" class="text-xs text-gray-400 pl-2">+{{ p.assignees.length - 4 }}</span>
                <span v-if="!p.assignees.length" class="text-xs text-gray-300">—</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <span class="text-xs font-medium text-gray-700">{{ p.interactionCount }}</span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-400">
              {{ lastContact(p) ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PartnersPartnerSearchAssign v-if="showSearchAssign" @close="showSearchAssign = false" @assigned="onAssigned" />
  </div>
</template>
