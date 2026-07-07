<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()

const isAdmin = await useIsAdmin()
const { activeProject } = useActiveProject()
const toast = useToast()

const SIZE_LABELS: Record<string, string> = {
  micro: '<10', small: '10–50', medium: '50–500', large: '500–5k', enterprise: '>5k',
}
const CONTACT_TYPE_COLORS: Record<string, string> = {
  PR: 'bg-blue-100 text-blue-700', HR: 'bg-purple-100 text-purple-700',
  Marketing: 'bg-orange-100 text-orange-700', CEO: 'bg-red-100 text-red-700',
  General: 'bg-gray-100 text-gray-600',
}
interface Contact {
  id: string; address: string | null; firstName: string | null; lastName: string | null
  role: string | null; contactType: string | null; note: string | null; priority: number
}
interface GlobalRecord {
  id: string; type: string; canonicalName: string; createdAt: string
  payload: Record<string, unknown>
  creator: { id: string; name: string; image: string | null }
  _count: { events: number }
  negotiations: Array<{ project: { id: string; name: string } }>
  contacts: Contact[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const activeTab = ref<'PARTNER'>('PARTNER')
const records   = ref<GlobalRecord[]>([])
const loading   = ref(false)
const offset    = ref(0)
const limit     = 100
const search     = ref('')
const filterSize = ref('')

async function fetchRecords(reset = false) {
  if (reset) offset.value = 0
  loading.value = true
  try {
    const data = await $fetch<GlobalRecord[]>('/api/records', {
      query: { type: activeTab.value, offset: offset.value, limit, search: search.value || undefined },
    })
    records.value = reset ? data : [...records.value, ...data]
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchRecords(true))

let searchDebounce: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => fetchRecords(true), 300)
})

const hasMore = computed(() => records.value.length > 0 && records.value.length === offset.value + limit)
function loadMore() { offset.value += limit; fetchRecords(false) }

// ── Helpers ──────────────────────────────────────────────────────────────────

function isProfiled(rec: GlobalRecord): boolean {
  return !!rec.payload.summary
}

function getStr(rec: GlobalRecord, key: string): string {
  return String(rec.payload[key] ?? '')
}

function getContacts(rec: GlobalRecord): Contact[] {
  return rec.contacts ?? []
}

function getArr(rec: GlobalRecord, key: string): string[] {
  const v = rec.payload[key]
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v) return [v]
  return []
}

// ── Client-side filters ───────────────────────────────────────────────────────
// Name search is server-side (see fetchRecords/watch above) so it covers the
// full dataset, not just the currently loaded page.

const availableSizes = computed(() =>
  Object.keys(SIZE_LABELS).filter(s => records.value.some(r => String(r.payload.size ?? '') === s)),
)

const filteredRecords = computed(() => {
  return records.value.filter(rec => {
    if (filterSize.value && String(rec.payload.size ?? '') !== filterSize.value) return false
    return true
  })
})

// ── Expand ────────────────────────────────────────────────────────────────────

const expandedIds = ref(new Set<string>())
function toggleExpand(id: string) {
  const s = new Set(expandedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedIds.value = s
}

const editingPartner = ref<GlobalRecord | null>(null)
const partnerToAssign = ref<GlobalRecord | null>(null)

function isInActiveProject(rec: GlobalRecord): boolean {
  return rec.negotiations.some(pr => pr.project.id === activeProject.value?.id)
}

async function removeFromProject(rec: GlobalRecord) {
  if (!confirm(`Opravdu odebrat partnera "${rec.canonicalName}" z projektu "${activeProject.value?.name}"? Historie jednání, e-mailů a poznámek zůstane zachována.`)) return
  await $fetch(`/api/partners/${rec.id}/project`, { method: 'DELETE' })
  toast.show(`Partner "${rec.canonicalName}" odebrán z projektu`, 'success')
  fetchRecords(true)
}

// ── Permissions ─────────────────────────────────────────────────────────────

const canCreatePartner = ref(true)
const showCreatePartnerModal = ref(false)
const showImportModal = ref(false)
const importPrefill = ref<string | undefined>(undefined)
const showNewDropdown = ref(false)

if (route.query.create === '1' && canCreatePartner.value) {
  activeTab.value = 'PARTNER'
  showCreatePartnerModal.value = true
  router.replace({ query: { ...route.query, create: undefined } })
}

function onPartnerCreated() {
  showCreatePartnerModal.value = false
  if (activeTab.value === 'PARTNER') fetchRecords(true)
}

function openTextImport(prefill?: string) {
  importPrefill.value = prefill
  showImportModal.value = true
  showNewDropdown.value = false
}

function openJsonFilePicker() {
  showNewDropdown.value = false
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.txt,application/json,text/plain'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => openTextImport(String(e.target?.result ?? ''))
    reader.readAsText(file)
  })
  input.click()
}

function onImportSaved() {
  showImportModal.value = false
  fetchRecords(true)
}

function onImportClose() {
  showImportModal.value = false
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Partneři</h1>
        <p class="text-sm text-gray-400 mt-1">Globální databáze partnerů</p>
      </div>
      <div v-if="canCreatePartner" class="relative flex items-stretch">
        <button
          class="text-sm font-medium text-white bg-primary px-4 py-2 rounded-l-lg hover:opacity-90 transition-opacity"
          @click="showCreatePartnerModal = true"
        >Nový partner</button>
        <button
          class="text-sm font-medium text-white bg-primary px-2 py-2 rounded-r-lg border-l border-white/20 hover:opacity-90 transition-opacity"
          @click="showNewDropdown = !showNewDropdown"
          aria-label="Další možnosti"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div v-show="showNewDropdown" class="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20 min-w-44">
          <button
            class="w-full text-left text-sm px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
            @click="openJsonFilePicker"
          >Nahrát JSON</button>
          <button
            class="w-full text-left text-sm px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors"
            @click="openTextImport()"
          >Vložit text</button>
        </div>
        <div v-show="showNewDropdown" class="fixed inset-0 z-10" @click="showNewDropdown = false" />
      </div>
    </div>

    <div class="mb-4 space-y-2.5">
      <input
        v-model="search"
        type="text"
        placeholder="Hledat podle názvu..."
        class="w-full max-w-sm text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
      />
      <div v-if="availableSizes.length" class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-400 font-medium w-16 flex-shrink-0">Velikost</span>
        <button
          v-for="s in availableSizes" :key="s"
          :class="['text-xs px-2.5 py-1 rounded-full border transition-colors', filterSize === s ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
          @click="filterSize = filterSize === s ? '' : s"
        >{{ SIZE_LABELS[s] }}</button>
        <button v-if="filterSize" class="text-xs text-indigo-500 hover:underline ml-1" @click="filterSize = ''">Zrušit</button>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50 text-left">
              <th class="px-4 py-3 w-7" />
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Název</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Odvětví</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Stav</th>
              <th class="px-4 py-3 font-medium text-gray-500 text-xs">Projekty</th>
              <th class="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="loading && records.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Načítám...</td>
            </tr>
            <tr v-else-if="filteredRecords.length === 0">
              <td colspan="6" class="text-center py-12 text-gray-400 text-sm">Žádní partneři</td>
            </tr>
            <template v-else>
              <template v-for="rec in filteredRecords" :key="rec.id">
                <tr class="hover:bg-gray-50 cursor-pointer transition-colors" @click="toggleExpand(rec.id)">
                  <td class="px-4 py-3">
                    <svg class="w-3 h-3 text-gray-300 transition-transform" :class="expandedIds.has(rec.id) ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                  <td class="px-4 py-3 font-medium text-gray-800">
                    <div class="flex items-center gap-2">
                      <span class="truncate max-w-64">{{ rec.canonicalName }}</span>
                      <a v-if="rec.payload.website || rec.payload.url" :href="String(rec.payload.website || rec.payload.url)" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-600 text-xs flex-shrink-0" @click.stop>↗</a>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span v-if="rec.payload.industry || rec.payload.type" class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ rec.payload.industry || rec.payload.type }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span v-if="isProfiled(rec)" class="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">Profilován</span>
                    <span v-else class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-400">Identifikován</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1 flex-wrap max-w-56">
                      <span v-for="pr in rec.negotiations" :key="pr.project.id" class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{{ pr.project.name }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-3">
                      <button
                        v-if="isAdmin && isInActiveProject(rec)"
                        class="text-red-400 hover:text-red-600 transition-colors"
                        title="Odebrat z aktuálního projektu"
                        @click.stop="removeFromProject(rec)"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        v-else-if="isAdmin"
                        class="text-indigo-400 hover:text-indigo-600 transition-colors"
                        title="Přiřadit do aktuálního projektu"
                        @click.stop="partnerToAssign = rec"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button class="text-gray-400 hover:text-gray-600 transition-colors" title="Upravit partnera" @click.stop="editingPartner = rec">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>

                <tr v-if="expandedIds.has(rec.id)" class="bg-indigo-50/20">
                  <td />
                  <td colspan="5" class="px-4 py-4 space-y-3">
                    <!-- Profiled partner: rich detail -->
                    <template v-if="isProfiled(rec)">
                      <p class="text-sm text-gray-700 leading-relaxed">{{ rec.payload.summary }}</p>

                      <div class="flex flex-wrap gap-1.5">
                        <span v-if="rec.payload.industry" class="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ rec.payload.industry }}</span>
                        <span v-if="rec.payload.size" class="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600">{{ SIZE_LABELS[String(rec.payload.size)] ?? rec.payload.size }}</span>
                        <span v-if="rec.payload.parentCompany" class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{{ rec.payload.parentCompany }}</span>
                        <span v-if="rec.payload.partnershipStyle" class="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600">{{ rec.payload.partnershipStyle }}</span>
                      </div>

                      <!-- Links -->
                      <div v-if="getStr(rec, 'website') || getStr(rec, 'linkedinUrl') || getStr(rec, 'instagramUrl')" class="flex flex-wrap gap-3">
                        <a v-if="getStr(rec, 'website')" :href="getStr(rec, 'website')" target="_blank" rel="noopener" class="text-xs text-indigo-500 hover:underline">Web ↗</a>
                        <a v-if="getStr(rec, 'linkedinUrl')" :href="getStr(rec, 'linkedinUrl')" target="_blank" rel="noopener" class="text-xs text-indigo-500 hover:underline">LinkedIn ↗</a>
                        <a v-if="getStr(rec, 'instagramUrl')" :href="getStr(rec, 'instagramUrl')" target="_blank" rel="noopener" class="text-xs text-indigo-500 hover:underline">Instagram ↗</a>
                      </div>

                      <!-- Activities -->
                      <div v-if="getArr(rec, 'activities').length > 0">
                        <p class="text-xs font-medium text-gray-500 mb-1">Aktivity</p>
                        <div class="flex flex-wrap gap-1">
                          <span v-for="(a, i) in getArr(rec, 'activities')" :key="i" class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">{{ a }}</span>
                        </div>
                      </div>

                      <!-- Contacts -->
                      <div v-if="getContacts(rec).length > 0">
                        <p class="text-xs font-medium text-gray-500 mb-1">Kontakty</p>
                        <div class="space-y-1">
                          <div v-for="c in getContacts(rec)" :key="c.id" class="flex items-center gap-2 text-xs text-gray-600">
                            <span :class="['px-1.5 py-0.5 rounded flex-shrink-0 text-xs', CONTACT_TYPE_COLORS[String(c.contactType || '')] ?? 'bg-gray-100 text-gray-500']">{{ c.contactType || 'kontakt' }}</span>
                            <span class="font-medium">{{ [c.firstName, c.lastName].filter(Boolean).join(' ') || 'generický' }}</span>
                            <span v-if="c.role && (c.firstName || c.lastName)" class="text-gray-400">{{ c.role }}</span>
                            <a v-if="c.address" :href="`mailto:${c.address}`" class="text-indigo-500 hover:underline ml-auto" @click.stop>{{ c.address }}</a>
                            <span v-else class="text-gray-300 italic ml-auto">bez emailu</span>
                          </div>
                        </div>
                      </div>

                      <!-- Research notes -->
                      <p v-if="getStr(rec, 'researchNotes')" class="text-xs text-gray-500 italic">{{ rec.payload.researchNotes }}</p>
                    </template>

                    <!-- Unprofiled partner: basic info -->
                    <template v-else>
                      <p v-if="rec.payload.description" class="text-sm text-gray-600 leading-relaxed">{{ rec.payload.description }}</p>
                      <p v-else class="text-xs text-gray-400">Tento partner zatím nebyl profilován.</p>
                    </template>

                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

    <div v-if="hasMore" class="mt-4 text-center">
      <button :disabled="loading" class="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors" @click="loadMore()">
        {{ loading ? 'Načítám...' : 'Načíst další' }}
      </button>
    </div>

    <PartnersPartnerFormModal v-if="showCreatePartnerModal" mode="create" @close="showCreatePartnerModal = false" @saved="onPartnerCreated" />
    <PartnersPartnerFormModal v-if="editingPartner" mode="edit" :partner="editingPartner" @close="editingPartner = null" @saved="editingPartner = null; fetchRecords(true)" @deleted="editingPartner = null; fetchRecords(true)" />
    <PartnersPartnerSearchAssign
      v-if="partnerToAssign"
      mode="choice"
      :preselected-partner="{
        id: partnerToAssign.id,
        canonicalName: partnerToAssign.canonicalName,
        industry: String(partnerToAssign.payload.industry ?? ''),
        size: String(partnerToAssign.payload.size ?? ''),
        website: String(partnerToAssign.payload.website ?? ''),
        hasNegotiation: false
      }"
      @close="partnerToAssign = null"
      @assigned="partnerToAssign = null; fetchRecords(true)"
    />
    <PartnersPartnerImportModal v-if="showImportModal" :prefill="importPrefill" @close="onImportClose" @saved="onImportSaved" />

  </div>
</template>
