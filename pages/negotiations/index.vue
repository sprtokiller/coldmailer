<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { session } = useUserSession()
const sessionUser = computed(() => (session.value as any)?.user)
const isAdmin = computed(() => !!(sessionUser.value as any)?.isAdmin)

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
  negotiationStatus: string | null
}

const search = ref('')
const { data: allPartners, pending, refresh: refreshPartners } = await useFetch<Partner[]>('/api/partners')

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

const CLOSED_STATUSES = new Set(['NOT_INTERESTED', 'NOT_THIS_TIME'])

function lastInteractionColor(p: Partner): string {
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
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Primární email</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přiřazení</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Interakce</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Poslední kontakt</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="pending">
            <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
          </tr>
          <tr v-else-if="!partners?.length">
            <td colspan="6" class="text-center py-12 text-gray-400 text-sm">
              {{ search ? 'Žádný partner nenalezen' : 'Zatím žádní oslovení partneři' }}
            </td>
          </tr>
          <tr
            v-for="p in partners"
            :key="p.id"
            :class="[
              'hover:bg-gray-50 cursor-pointer transition-colors',
              CLOSED_STATUSES.has(p.negotiationStatus ?? '') ? 'opacity-60' : '',
            ]"
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
                v-if="p.negotiationStatus"
                class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                :class="NEGOTIATION_STATUS_COLORS[p.negotiationStatus] ?? 'bg-gray-100 text-gray-600'"
              >
                {{ NEGOTIATION_STATUS_LABELS[p.negotiationStatus] ?? p.negotiationStatus }}
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
            <td
              class="px-4 py-3 text-xs"
              :class="lastInteractionColor(p) ? [lastInteractionColor(p), 'rounded font-medium'] : 'text-gray-400'"
            >
              {{ lastContact(p) ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
