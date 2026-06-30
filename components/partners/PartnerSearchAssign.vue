<script setup lang="ts">
const emit = defineEmits<{ close: []; assigned: [{ partnerId: string }] }>()

interface SearchResult {
  id: string; canonicalName: string
  industry: string | null; size: string | null; website: string | null
  hasInteractionsInProject: boolean
}
interface AppUser { id: string; name: string; image: string | null; email: string }

const query = ref('')
const results = ref<SearchResult[]>([])
const searching = ref(false)
const selectedPartner = ref<SearchResult | null>(null)
const assigneeIds = ref<string[]>([])
const assigning = ref(false)
const error = ref('')

const { data: allUsers } = useFetch<AppUser[]>('/api/users')

let debounceTimer: ReturnType<typeof setTimeout>
watch(query, (val) => {
  clearTimeout(debounceTimer)
  selectedPartner.value = null
  if (val.trim().length < 2) { results.value = []; return }
  debounceTimer = setTimeout(async () => {
    searching.value = true
    try {
      results.value = await $fetch<SearchResult[]>('/api/partners/search', { query: { search: val.trim() } })
    } catch { results.value = [] }
    finally { searching.value = false }
  }, 300)
})

function selectPartner(p: SearchResult) {
  selectedPartner.value = p
  assigneeIds.value = []
  error.value = ''
}

async function assign() {
  if (!selectedPartner.value || assigning.value) return
  if (assigneeIds.value.length === 0) { error.value = 'Vyberte alespoň jednoho člena týmu.'; return }
  assigning.value = true
  error.value = ''
  try {
    await $fetch(`/api/partners/${selectedPartner.value.id}/interactions`, {
      method: 'POST',
      body: { type: 'FULFILLMENT', assigneeIds: assigneeIds.value },
    })
    emit('assigned', { partnerId: selectedPartner.value.id })
    emit('close')
  } catch (e: any) {
    error.value = e.statusMessage ?? 'Nepodařilo se přiřadit.'
  } finally {
    assigning.value = false
  }
}

const SIZE_LABELS: Record<string, string> = {
  micro: '<10', small: '10–50', medium: '50–500', large: '500–5k', enterprise: '>5k',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-20 px-4" @click.self="emit('close')">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 class="text-base font-semibold text-gray-800">Přidat partnera do projektu</h2>
          <button class="text-gray-400 hover:text-gray-600" @click="emit('close')">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <!-- Search input -->
          <div>
            <input
              v-model="query"
              type="text"
              placeholder="Hledat partnera podle názvu..."
              class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
              autofocus
            />
          </div>

          <!-- Results -->
          <div v-if="!selectedPartner">
            <div v-if="searching" class="text-xs text-gray-400 py-3 text-center">Hledám...</div>
            <div v-else-if="query.trim().length >= 2 && results.length === 0" class="py-4 text-center">
              <p class="text-xs text-gray-400">Žádní partneři nenalezeni</p>
              <button
                class="mt-2 text-sm font-medium text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
                @click="emit('close'); navigateTo('/partners?tab=PARTNER&create=1')"
              >
                Vytvořit nového partnera
              </button>
            </div>
            <ul v-else class="max-h-60 overflow-y-auto divide-y divide-gray-50">
              <li
                v-for="r in results"
                :key="r.id"
                class="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors"
                @click="selectPartner(r)"
              >
                <div>
                  <div class="text-sm font-medium text-gray-800">{{ r.canonicalName }}</div>
                  <div class="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                    <span v-if="r.industry">{{ r.industry }}</span>
                    <span v-if="r.size">{{ SIZE_LABELS[r.size] ?? r.size }}</span>
                  </div>
                </div>
                <span
                  v-if="r.hasInteractionsInProject"
                  class="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium whitespace-nowrap"
                >Již v projektu</span>
              </li>
            </ul>
          </div>

          <!-- Selected partner — assign step -->
          <div v-if="selectedPartner" class="space-y-3">
            <div class="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2">
              <span class="text-sm font-medium text-indigo-800">{{ selectedPartner.canonicalName }}</span>
              <button class="text-xs text-indigo-500 hover:text-indigo-700" @click="selectedPartner = null">Změnit</button>
            </div>

            <div v-if="error" class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{{ error }}</div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-2">Přiřadit členy obchodního týmu</label>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="u in allUsers"
                  :key="u.id"
                  class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border cursor-pointer transition-colors"
                  :class="assigneeIds.includes(u.id) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                >
                  <input v-model="assigneeIds" type="checkbox" :value="u.id" class="sr-only" />
                  <img v-if="u.image" :src="u.image" class="w-4 h-4 rounded-full" referrerpolicy="no-referrer" />
                  {{ u.name }}
                </label>
              </div>
            </div>

            <div class="flex justify-end pt-2">
              <button
                class="text-sm font-medium text-white bg-primary px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="assigneeIds.length === 0 || assigning"
                @click="assign"
              >
                {{ assigning ? 'Přiřazuji...' : 'Přiřadit do projektu' }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>
