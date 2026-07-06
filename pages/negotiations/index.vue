<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface Contact { id: string; address: string | null; label: string | null }
interface AssigneeUser { id: string; name: string; image: string | null }
interface Partner {
  id: string
  canonicalName: string
  payload: Record<string, unknown>
  contacts: Contact[]
  assignees: AssigneeUser[]
  lastInteractionAt: string | null
  interactionCount: number
  negotiationStatus: string | null
  inProject: boolean
}

const search = ref('')
const { data: allPartners, pending, refresh: refreshPartners } = await useFetch<Partner[]>('/api/partners')
const { data: meData } = await useFetch<{ user: { id: string; isAdmin: boolean } }>('/api/settings/me')

const currentUserId = computed(() => meData.value?.user?.id ?? null)
const isAdmin = computed(() => meData.value?.user?.isAdmin ?? false)

/** Seřadí skupinu partnerů dle lastInteractionAt DESC, záznamy bez data na konec */
function sortByLastInteraction(list: Partner[]): Partner[] {
  return [...list].sort((a, b) => {
    if (a.lastInteractionAt && b.lastInteractionAt) {
      return new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()
    }
    if (a.lastInteractionAt) return -1
    if (b.lastInteractionAt) return 1
    return 0
  })
}

/** Filtrovaný + seřazený seznam — přiřazení mně nahoře, ostatní dole */
const sortedPartners = computed(() => {
  const q = search.value.toLowerCase().trim()
  const filtered = (allPartners.value ?? []).filter(p =>
    !q || p.canonicalName.toLowerCase().includes(q),
  )
  const uid = currentUserId.value
  const mine = filtered.filter(p => uid && p.assignees.some(a => a.id === uid))
  const others = filtered.filter(p => !uid || !p.assignees.some(a => a.id === uid))
  return [
    ...sortByLastInteraction(mine),
    ...sortByLastInteraction(others),
  ]
})

/** Vrátí true, pokud je partner READ-ONLY pro přihlášeného uživatele (není mu přiřazen, nebo je admin) */
function isReadOnly(p: Partner): boolean {
  if (isAdmin.value) return false
  const uid = currentUserId.value
  if (!uid) return false
  return !p.assignees.some(a => a.id === uid)
}

function lastContact(p: Partner) {
  if (!p.lastInteractionAt) return null
  return new Date(p.lastInteractionAt).toLocaleDateString('cs-CZ')
}

const CLOSED_STATUSES = new Set(['NOT_INTERESTED', 'NOT_THIS_TIME'])

function lastInteractionColor(p: Partner): string {
  if (isReadOnly(p)) return ''
  if (CLOSED_STATUSES.has(p.negotiationStatus ?? '')) return 'bg-gray-100 text-gray-400'
  if (!p.lastInteractionAt) return 'bg-gray-100 text-gray-400'
  const days = (Date.now() - new Date(p.lastInteractionAt).getTime()) / 86_400_000
  if (days < 3) return ''
  if (days < 7) return 'bg-yellow-100 text-yellow-700'
  if (days < 14) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

const NEGOTIATION_STATUS_LABELS: Record<string, string> = {
  CONTACTED: 'Osloveno',
  REMINDED: 'Připomenuto',
  WAITING_FOR_THEM: 'Čekání na ně',
  WAITING_FOR_US: 'Čekání na nás',
  FULFILLING: 'Plnění',
  THANKS_REMAINING: 'Zbývá poděkovat',
  COMPLETED: 'Dokončeno',
  NOT_INTERESTED: 'Nezájem',
  NOT_THIS_TIME: 'Tentokrát nezájem',
}

const NEGOTIATION_STATUS_COLORS: Record<string, string> = {
  CONTACTED: 'bg-blue-100 text-blue-700',
  REMINDED: 'bg-yellow-100 text-yellow-700',
  WAITING_FOR_THEM: 'bg-orange-100 text-orange-700',
  WAITING_FOR_US: 'bg-red-100 text-red-700',
  FULFILLING: 'bg-purple-100 text-purple-700',
  THANKS_REMAINING: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-green-100 text-green-700',
  NOT_INTERESTED: 'bg-gray-100 text-gray-500',
  NOT_THIS_TIME: 'bg-gray-200 text-gray-600',
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold text-gray-800">Oslovení partneři</h1>
      <p class="text-sm text-gray-400 mt-1">Partneři s probíhající komunikací</p>
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
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Stav jednání</th>

            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přiřazení</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Interakce</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Poslední kontakt</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="pending">
            <td colspan="5" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
          </tr>
          <tr v-else-if="!sortedPartners?.length">
            <td colspan="5" class="text-center py-12 text-gray-400 text-sm">
              {{ search ? 'Žádný partner nenalezen' : 'Zatím žádní oslovení partneři' }}
            </td>
          </tr>
          <tr
            v-for="p in sortedPartners"
            :key="p.id"
            :class="[
              'cursor-pointer transition-colors',
              isReadOnly(p)
                ? 'opacity-40 hover:opacity-60 grayscale'
                : 'hover:bg-gray-50',
              !isReadOnly(p) && (CLOSED_STATUSES.has(p.negotiationStatus ?? '') || !p.inProject) ? 'opacity-60' : '',
            ]"
            @click="navigateTo(`/negotiations/${p.id}`)"
          >
            <td class="px-4 py-3 font-medium" :class="isReadOnly(p) ? 'text-gray-500' : 'text-gray-800'">
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
                <span v-if="!p.inProject" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 whitespace-nowrap">Mimo projekt</span>
              </div>
              <div v-if="p.payload.summary" :title="String(p.payload.summary)" class="text-[11px] text-gray-400 mt-0.5 line-clamp-1 max-w-56">
                {{ p.payload.summary }}
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="p.negotiationStatus"
                class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                :class="isReadOnly(p) ? 'bg-gray-100 text-gray-400' : (NEGOTIATION_STATUS_COLORS[p.negotiationStatus] ?? 'bg-gray-100 text-gray-600')"
              >
                {{ NEGOTIATION_STATUS_LABELS[p.negotiationStatus] ?? p.negotiationStatus }}
              </span>
              <span v-else class="text-xs text-gray-300">—</span>
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
              <span class="text-xs font-medium" :class="isReadOnly(p) ? 'text-gray-400' : 'text-gray-700'">{{ p.interactionCount }}</span>
            </td>
            <td
              class="px-4 py-3 text-xs"
              :class="isReadOnly(p) ? 'text-gray-400' : (lastInteractionColor(p) ? [lastInteractionColor(p), 'rounded font-medium'] : 'text-gray-400')"
            >
              {{ lastContact(p) ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
