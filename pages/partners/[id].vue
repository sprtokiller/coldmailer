<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact { id: string; address: string; label: string | null; isPrimary: boolean }
interface AssignedUser { globalRecordId: string; userId: string; user: { id: string; name: string; image: string | null } }
interface MailEvent {
  id: string; direction: 'SENT' | 'RECEIVED'; subject: string; body: string | null
  sentAt: string; fromAddress: string | null; toAddress: string | null
  creator: { id: string; name: string; image: string | null }
}
interface PartnerNote {
  id: string; content: string; createdAt: string; updatedAt: string
  author: { id: string; name: string; image: string | null }
}
interface Fulfillment { myToThem: string | null; themToUs: string | null }
interface Partner {
  id: string; canonicalName: string; payload: Record<string, string>
  contacts: Contact[]
  assignments: AssignedUser[]
  mailEvents: MailEvent[]
  partnerNotes: PartnerNote[]
  fulfillment: Fulfillment | null
}
interface AppUser { id: string; name: string; image: string | null; email: string }

// ── Data ─────────────────────────────────────────────────────────────────────

const { data: partner, refresh } = await useFetch<Partner>(`/api/partners/${id}`)
const { data: allUsers } = await useFetch<AppUser[]>('/api/users')
const { user: me } = useUserSession()

// ── UI state ──────────────────────────────────────────────────────────────────

type PartnerTab = 'communication' | 'notes' | 'fulfillment'
const VALID_PARTNER_TABS: PartnerTab[] = ['communication', 'notes', 'fulfillment']
const initialTab = VALID_PARTNER_TABS.includes(route.query.tab as PartnerTab) ? (route.query.tab as PartnerTab) : 'communication'
const activeTab = ref<PartnerTab>(initialTab)

watch(activeTab, (newTab) => {
  router.replace({ query: { ...route.query, tab: newTab } })
})
const showContactsPanel = ref(false)
const showProfileModal = ref(false)
const expandedEvents = ref(new Set<string>())

// ── Contacts ──────────────────────────────────────────────────────────────────

const newContactAddress = ref('')
const newContactLabel = ref('')
const newContactPrimary = ref(false)

async function addContact() {
  if (!newContactAddress.value.trim()) return
  await $fetch(`/api/partners/${id}/contacts`, {
    method: 'POST',
    body: { address: newContactAddress.value.trim(), label: newContactLabel.value.trim() || null, isPrimary: newContactPrimary.value },
  })
  newContactAddress.value = ''; newContactLabel.value = ''; newContactPrimary.value = false
  await refresh()
}

async function setPrimary(cId: string) {
  await $fetch(`/api/partners/${id}/contacts/${cId}`, { method: 'PATCH', body: { isPrimary: true } })
  await refresh()
}

async function deleteContact(cId: string) {
  await $fetch(`/api/partners/${id}/contacts/${cId}`, { method: 'DELETE' })
  await refresh()
}

// ── Assignments ───────────────────────────────────────────────────────────────

const assignUserId = ref('')

const unassignedUsers = computed(() => {
  const assigned = new Set(partner.value?.assignments.map(a => a.userId) ?? [])
  return (allUsers.value ?? []).filter(u => !assigned.has(u.id))
})

async function assignUser() {
  if (!assignUserId.value) return
  await $fetch(`/api/partners/${id}/assignments`, { method: 'POST', body: { userId: assignUserId.value } })
  assignUserId.value = ''
  await refresh()
}

async function removeAssignment(userId: string) {
  await $fetch(`/api/partners/${id}/assignments/${userId}`, { method: 'DELETE' })
  await refresh()
}

// ── Mail events ───────────────────────────────────────────────────────────────

const showMailForm = ref(false)
const mailForm = ref({ direction: 'SENT' as 'SENT' | 'RECEIVED', subject: '', body: '', sentAt: '', fromAddress: '', toAddress: '' })

function resetMailForm() {
  mailForm.value = { direction: 'SENT', subject: '', body: '', sentAt: '', fromAddress: '', toAddress: '' }
  showMailForm.value = false
}

async function addMailEvent() {
  const f = mailForm.value
  if (!f.subject.trim() || !f.sentAt) return
  await $fetch(`/api/partners/${id}/mail-events`, {
    method: 'POST',
    body: { ...f, subject: f.subject.trim(), body: f.body.trim() || null, fromAddress: f.fromAddress.trim() || null, toAddress: f.toAddress.trim() || null },
  })
  resetMailForm()
  await refresh()
}

async function deleteMailEvent(evId: string) {
  await $fetch(`/api/partners/${id}/mail-events/${evId}`, { method: 'DELETE' })
  await refresh()
}

function toggleEvent(evId: string) {
  const s = new Set(expandedEvents.value)
  s.has(evId) ? s.delete(evId) : s.add(evId)
  expandedEvents.value = s
}

// ── Notes ─────────────────────────────────────────────────────────────────────

const newNote = ref('')
const editingNoteId = ref<string | null>(null)
const editingNoteContent = ref('')

async function addNote() {
  if (!newNote.value.trim()) return
  await $fetch(`/api/partners/${id}/notes`, { method: 'POST', body: { content: newNote.value.trim() } })
  newNote.value = ''
  await refresh()
}

function startEditNote(note: PartnerNote) {
  editingNoteId.value = note.id
  editingNoteContent.value = note.content
}

async function saveNote() {
  if (!editingNoteId.value || !editingNoteContent.value.trim()) return
  await $fetch(`/api/partners/${id}/notes/${editingNoteId.value}`, {
    method: 'PATCH', body: { content: editingNoteContent.value.trim() },
  })
  editingNoteId.value = null
  await refresh()
}

async function deleteNote(nId: string) {
  await $fetch(`/api/partners/${id}/notes/${nId}`, { method: 'DELETE' })
  await refresh()
}

// ── Fulfillment ───────────────────────────────────────────────────────────────

const fulfillment = ref({ myToThem: '', themToUs: '' })
watch(() => partner.value?.fulfillment, (f) => {
  fulfillment.value = { myToThem: f?.myToThem ?? '', themToUs: f?.themToUs ?? '' }
}, { immediate: true })

const fulfillmentSaved = ref(false)
async function saveFulfillment() {
  await $fetch(`/api/partners/${id}/fulfillment`, {
    method: 'PUT',
    body: { myToThem: fulfillment.value.myToThem || null, themToUs: fulfillment.value.themToUs || null },
  })
  fulfillmentSaved.value = true
  setTimeout(() => { fulfillmentSaved.value = false }, 2000)
  await refresh()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const primaryContact = computed(() => partner.value?.contacts.find(c => c.isPrimary) ?? partner.value?.contacts[0] ?? null)

function fmtDate(d: string) {
  return new Date(d).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div v-if="partner">
    <!-- ── Header ── -->
    <div class="mb-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <h1 class="text-2xl font-semibold text-gray-800">{{ partner.canonicalName }}</h1>
            <a
              v-if="partner.payload.website || partner.payload.url"
              :href="partner.payload.website || partner.payload.url"
              target="_blank"
              rel="noopener"
              class="text-indigo-400 hover:text-indigo-600 text-sm"
            >↗ web</a>
            <span
              v-if="partner.payload.industry || partner.payload.type"
              class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600"
            >{{ partner.payload.industry || partner.payload.type }}</span>
          </div>
          <div class="mt-1.5 flex items-center gap-3">
            <span v-if="primaryContact" class="text-sm font-mono text-gray-500">{{ primaryContact.address }}</span>
            <span v-else class="text-sm text-gray-300 italic">Bez emailu</span>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            @click="showContactsPanel = !showContactsPanel"
          >
            Editovat
          </button>
          <button
            v-if="partner.payload.description"
            class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            @click="showProfileModal = true"
          >
            Profil
          </button>
        </div>
      </div>

      <!-- Přiřazení uživatelé -->
      <div class="mt-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-gray-400 font-medium">Přiřazeni:</span>
        <div class="flex items-center -space-x-1">
          <template v-for="a in partner.assignments" :key="a.userId">
            <button class="group relative" :title="a.user.name" @click="removeAssignment(a.userId)">
              <img
                v-if="a.user.image"
                :src="a.user.image"
                :alt="a.user.name"
                class="w-7 h-7 rounded-full ring-2 ring-white object-cover group-hover:opacity-70 transition-opacity"
                referrerpolicy="no-referrer"
              />
              <div
                v-else
                class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-xs font-medium group-hover:opacity-70 transition-opacity"
              >
                {{ a.user.name.charAt(0).toUpperCase() }}
              </div>
              <span class="absolute -top-0.5 -right-0.5 hidden group-hover:flex w-3.5 h-3.5 bg-red-400 rounded-full items-center justify-center text-white text-[8px]">×</span>
            </button>
          </template>
        </div>
        <select
          v-if="unassignedUsers.length"
          v-model="assignUserId"
          class="text-xs px-2 py-1 border border-dashed border-gray-300 rounded-lg text-gray-400 focus:outline-none focus:border-indigo-300 bg-white"
          @change="assignUser"
        >
          <option value="">+ Přidat uživatele</option>
          <option v-for="u in unassignedUsers" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </div>
    </div>

    <!-- ── Contacts Panel ── -->
    <div v-if="showContactsPanel" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">Emailové adresy</h3>
      <div class="space-y-2 mb-4">
        <div
          v-for="c in partner.contacts"
          :key="c.id"
          class="flex items-center gap-2 text-sm"
        >
          <span
            :class="['font-mono flex-1 truncate', c.isPrimary ? 'text-gray-800 font-medium' : 'text-gray-500']"
          >{{ c.address }}</span>
          <span v-if="c.label" class="text-xs text-gray-400">{{ c.label }}</span>
          <span v-if="c.isPrimary" class="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">primární</span>
          <button
            v-else
            class="text-xs text-gray-400 hover:text-indigo-500 transition-colors"
            @click="setPrimary(c.id)"
          >nastavit primární</button>
          <button class="text-xs text-gray-300 hover:text-red-400 transition-colors" @click="deleteContact(c.id)">×</button>
        </div>
        <p v-if="!partner.contacts.length" class="text-xs text-gray-400 italic">Žádné emailové adresy</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input
          v-model="newContactAddress"
          type="email"
          placeholder="email@partner.cz"
          class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-48"
          @keydown.enter="addContact"
        />
        <input
          v-model="newContactLabel"
          type="text"
          placeholder="Štítek (volitelný)"
          class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 w-36"
        />
        <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input v-model="newContactPrimary" type="checkbox" class="rounded" />
          primární
        </label>
        <button
          class="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          @click="addContact"
        >Přidat</button>
      </div>
    </div>

    <!-- ── Tabs ── -->
    <div class="flex gap-1 border-b border-gray-200 mb-6">
      <button
        v-for="tab in [{ key: 'communication', label: 'Komunikace' }, { key: 'notes', label: 'Poznámky' }, { key: 'fulfillment', label: 'Plnění' }]"
        :key="tab.key"
        :class="['px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
        @click="activeTab = tab.key as typeof activeTab"
      >{{ tab.label }}</button>
    </div>

    <!-- ── KOMUNIKACE ── -->
    <div v-if="activeTab === 'communication'">
      <div class="flex justify-end mb-4">
        <button
          class="text-sm px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
          @click="showMailForm = !showMailForm"
        >
          {{ showMailForm ? 'Zrušit' : '+ Přidat email' }}
        </button>
      </div>

      <!-- Add email form -->
      <div v-if="showMailForm" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <div class="flex gap-2">
          <button
            v-for="dir in [{ key: 'SENT', label: 'Odeslali jsme' }, { key: 'RECEIVED', label: 'Obdrželi jsme' }]"
            :key="dir.key"
            :class="['flex-1 text-sm py-2 rounded-lg border transition-colors font-medium', mailForm.direction === dir.key ? (dir.key === 'SENT' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-green-50 border-green-300 text-green-700') : 'border-gray-200 text-gray-500 hover:border-gray-300']"
            @click="mailForm.direction = dir.key as 'SENT' | 'RECEIVED'"
          >{{ dir.label }}</button>
        </div>
        <input
          v-model="mailForm.subject"
          type="text"
          placeholder="Předmět *"
          class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
        />
        <div class="flex gap-2">
          <input
            v-model="mailForm.sentAt"
            type="datetime-local"
            class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
          />
          <input
            v-model="mailForm.fromAddress"
            type="email"
            :placeholder="mailForm.direction === 'SENT' ? 'Od (nás)' : 'Od (partnera)'"
            class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
          />
          <input
            v-model="mailForm.toAddress"
            type="email"
            :placeholder="mailForm.direction === 'SENT' ? 'Komu (partner)' : 'Komu (nás)'"
            class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
          />
        </div>
        <textarea
          v-model="mailForm.body"
          rows="3"
          placeholder="Text emailu (volitelný)"
          class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none"
        />
        <div class="flex justify-end">
          <button
            :disabled="!mailForm.subject.trim() || !mailForm.sentAt"
            class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            @click="addMailEvent"
          >Uložit</button>
        </div>
      </div>

      <!-- Timeline -->
      <div v-if="partner.mailEvents.length" class="relative">
        <!-- Center line -->
        <div class="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 -translate-x-1/2" />

        <div
          v-for="event in partner.mailEvents"
          :key="event.id"
          class="relative flex items-start mb-5"
        >
          <!-- Left half: RECEIVED -->
          <div class="w-1/2 pr-8">
            <div
              v-if="event.direction === 'RECEIVED'"
              class="bg-green-50 border border-green-100 rounded-xl p-3 cursor-pointer hover:border-green-200 transition-colors"
              @click="toggleEvent(event.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-medium text-gray-800 leading-snug">{{ event.subject }}</p>
                <button
                  class="text-gray-200 hover:text-red-400 text-lg leading-none flex-shrink-0 transition-colors"
                  @click.stop="deleteMailEvent(event.id)"
                >×</button>
              </div>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="text-xs text-green-600 font-medium">↓ Obdrženo</span>
                <span class="text-xs text-gray-400">{{ fmtDate(event.sentAt) }}</span>
                <span v-if="event.fromAddress" class="text-xs font-mono text-gray-400">{{ event.fromAddress }}</span>
              </div>
              <div v-if="expandedEvents.has(event.id) && event.body" class="mt-2 pt-2 border-t border-green-100 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{{ event.body }}</div>
            </div>
          </div>

          <!-- Node -->
          <div
            class="absolute left-1/2 -translate-x-1/2 top-3 z-10 w-3 h-3 rounded-full ring-2 ring-white"
            :class="event.direction === 'SENT' ? 'bg-blue-400' : 'bg-green-400'"
          />

          <!-- Right half: SENT -->
          <div class="w-1/2 pl-8">
            <div
              v-if="event.direction === 'SENT'"
              class="bg-blue-50 border border-blue-100 rounded-xl p-3 cursor-pointer hover:border-blue-200 transition-colors"
              @click="toggleEvent(event.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-medium text-gray-800 leading-snug">{{ event.subject }}</p>
                <button
                  class="text-gray-200 hover:text-red-400 text-lg leading-none flex-shrink-0 transition-colors"
                  @click.stop="deleteMailEvent(event.id)"
                >×</button>
              </div>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span class="text-xs text-blue-600 font-medium">↑ Odesláno</span>
                <span class="text-xs text-gray-400">{{ fmtDate(event.sentAt) }}</span>
                <span v-if="event.toAddress" class="text-xs font-mono text-gray-400">→ {{ event.toAddress }}</span>
              </div>
              <div v-if="expandedEvents.has(event.id) && event.body" class="mt-2 pt-2 border-t border-blue-100 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{{ event.body }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-16 text-gray-300 text-sm">
        Zatím žádná komunikace — přidejte první email
      </div>
    </div>

    <!-- ── POZNÁMKY ── -->
    <div v-else-if="activeTab === 'notes'">
      <div class="space-y-3 mb-6">
        <div
          v-for="note in partner.partnerNotes"
          :key="note.id"
          class="bg-white border border-gray-200 rounded-xl p-4"
        >
          <div class="flex items-start gap-3">
            <img
              v-if="note.author.image"
              :src="note.author.image"
              :alt="note.author.name"
              class="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="w-7 h-7 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-medium flex-shrink-0 mt-0.5"
            >
              {{ note.author.name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-medium text-gray-700">{{ note.author.name }}</span>
                <span class="text-xs text-gray-400">{{ fmtDateShort(note.createdAt) }}</span>
                <span v-if="note.createdAt !== note.updatedAt" class="text-xs text-gray-300">(upraveno)</span>
              </div>
              <div v-if="editingNoteId === note.id">
                <textarea
                  v-model="editingNoteContent"
                  rows="3"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none"
                />
                <div class="flex gap-2 mt-2">
                  <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="saveNote">Uložit</button>
                  <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors" @click="editingNoteId = null">Zrušit</button>
                </div>
              </div>
              <p v-else class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{{ note.content }}</p>
            </div>
            <div v-if="note.author.id === me?.id && editingNoteId !== note.id" class="flex items-center gap-1 flex-shrink-0">
              <button class="text-xs text-gray-300 hover:text-indigo-500 transition-colors" @click="startEditNote(note)">upravit</button>
              <button class="text-xs text-gray-300 hover:text-red-400 transition-colors" @click="deleteNote(note.id)">smazat</button>
            </div>
          </div>
        </div>
        <p v-if="!partner.partnerNotes.length" class="text-center py-8 text-gray-300 text-sm">Zatím žádné poznámky</p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <textarea
          v-model="newNote"
          rows="3"
          placeholder="Nová poznámka..."
          class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none mb-3"
        />
        <div class="flex justify-end">
          <button
            :disabled="!newNote.trim()"
            class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            @click="addNote"
          >Přidat poznámku</button>
        </div>
      </div>
    </div>

    <!-- ── PLNĚNÍ ── -->
    <div v-else-if="activeTab === 'fulfillment'">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <h3 class="text-sm font-semibold text-blue-800 mb-3">My jim</h3>
          <p class="text-xs text-blue-400 mb-3">Co jsme slíbili / dodali my partnerovi</p>
          <textarea
            v-model="fulfillment.myToThem"
            rows="8"
            placeholder="Např. logo na webu, zmínka v newsletteru, cena na akci..."
            class="w-full text-sm px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none bg-white"
          />
        </div>
        <div class="bg-green-50 border border-green-100 rounded-xl p-5">
          <h3 class="text-sm font-semibold text-green-800 mb-3">Oni nám</h3>
          <p class="text-xs text-green-400 mb-3">Co nám slíbili / dodali partneři</p>
          <textarea
            v-model="fulfillment.themToUs"
            rows="8"
            placeholder="Např. finanční podpora 10 000 Kč, sponzorský balíček..."
            class="w-full text-sm px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:border-green-400 resize-none bg-white"
          />
        </div>
      </div>
      <div class="flex justify-end mt-4">
        <button
          class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          @click="saveFulfillment"
        >
          {{ fulfillmentSaved ? 'Uloženo ✓' : 'Uložit' }}
        </button>
      </div>
    </div>

    <!-- ── Profile modal ── -->
    <div v-if="showProfileModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" @click.self="showProfileModal = false">
      <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="font-semibold text-gray-800">Profil partnera</h2>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="showProfileModal = false">×</button>
        </div>
        <div class="overflow-y-auto p-6 flex-1">
          <p class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{{ partner.payload.description }}</p>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-center py-16 text-gray-400 text-sm">Načítám...</div>
</template>
