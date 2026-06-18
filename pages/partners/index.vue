<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface Contact { id: string; address: string; isPrimary: boolean; label: string | null }
interface AssigneeUser { id: string; name: string; image: string | null }
interface Partner {
  id: string
  canonicalName: string
  payload: Record<string, string>
  contacts: Contact[]
  assignees: AssigneeUser[]
  lastInteractionAt: string | null
  interactionCount: number
}

const search = ref('')
const { data: allPartners, pending } = await useFetch<Partner[]>('/api/partners')

const partners = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return allPartners.value ?? []
  return (allPartners.value ?? []).filter(p => p.canonicalName.toLowerCase().includes(q))
})

function primaryEmail(p: Partner) {
  return p.contacts.find(c => c.isPrimary)?.address ?? p.contacts[0]?.address ?? null
}
function lastContact(p: Partner) {
  if (!p.lastInteractionAt) return null
  return new Date(p.lastInteractionAt).toLocaleDateString('cs-CZ')
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Partneři</h1>
        <p class="text-sm text-gray-400 mt-1">Správa vztahů s partnery a komunikace</p>
      </div>
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
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Primární email</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Přiřazení</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs text-center">Interakce</th>
            <th class="px-4 py-3 font-medium text-gray-500 text-xs">Poslední kontakt</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="pending">
            <td colspan="5" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
          </tr>
          <tr v-else-if="!partners?.length">
            <td colspan="5" class="text-center py-12 text-gray-400 text-sm">
              {{ search ? 'Žádný partner nenalezen' : 'Zatím žádní partneři — přidejte je přes Databázi nebo Pipeline' }}
            </td>
          </tr>
          <tr
            v-for="p in partners"
            :key="p.id"
            class="hover:bg-gray-50 cursor-pointer transition-colors"
            @click="navigateTo(`/partners/${p.id}`)"
          >
            <td class="px-4 py-3 font-medium text-gray-800">
              <div class="flex items-center gap-2">
                <span class="truncate max-w-64">{{ p.canonicalName }}</span>
                <a
                  v-if="p.payload.website || p.payload.url"
                  :href="p.payload.website || p.payload.url"
                  target="_blank"
                  rel="noopener"
                  class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0"
                  @click.stop
                >↗</a>
              </div>
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
  </div>
</template>
