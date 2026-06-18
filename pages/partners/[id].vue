<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact { id: string; address: string; label: string | null; isPrimary: boolean }
interface AssigneeUser { id: string; name: string; image: string | null }
interface InteractionAssignee { userId: string; user: AssigneeUser }
interface Interaction {
  id: string
  type: 'NOTE' | 'EMAIL' | 'FULFILLMENT'
  actionStatus: 'WAITING_FOR_THEM' | 'WAITING_FOR_US' | 'BEFORE_MEETING' | 'NONE' | null
  dealStage: 'CONTACTED' | 'NEGOTIATING' | 'NOT_INTERESTED' | 'NOT_THIS_TIME' | 'PARTNER' | 'COMPLETED' | null
  content: string | null
  createdAt: string
  updatedAt: string
  creator: AssigneeUser
  assignees: InteractionAssignee[]
  direction: 'SENT' | 'RECEIVED' | null
  subject: string | null
  sentAt: string | null
  fromAddress: string | null
  toAddress: string | null
  gmailId: string | null
  myToThem: string | null
  themToUs: string | null
  projectId: string
  project: { id: string; name: string }
  canEdit: boolean
}
interface CrossProjectMeta {
  projectId: string
  projectName: string
  interactionCount: number
  lastActivityAt: string | null
  dealStages: string[]
  actionStatuses: string[]
  assigneeNames: string[]
}
interface InteractionsResponse {
  items: Interaction[]
  crossProjectSummary: CrossProjectMeta[]
  access: { canViewAll: boolean; canEditAll: boolean }
}
interface Partner {
  id: string; canonicalName: string; payload: Record<string, string>
  contacts: Contact[]
  assignees: AssigneeUser[]
}
interface AppUser { id: string; name: string; image: string | null; email: string }

// ── Data ─────────────────────────────────────────────────────────────────────

const { data: partner, refresh: refreshPartner } = await useFetch<Partner>(`/api/partners/${id}`)
const { data: interactionsData, refresh: refreshInteractions } = await useFetch<InteractionsResponse>(`/api/partners/${id}/interactions`)
const { data: allUsers } = await useFetch<AppUser[]>('/api/users')
const { user: me } = useUserSession()

async function refresh() {
  await Promise.all([refreshPartner(), refreshInteractions()])
}

// ── UI state ──────────────────────────────────────────────────────────────────

const showContactsPanel = ref(false)
const showProfileModal = ref(false)
const expandedEvents = ref(new Set<string>())
const showCrossProject = ref(false)

// ── Computed ─────────────────────────────────────────────────────────────────

const interactions = computed(() => interactionsData.value?.items ?? [])
const crossProjectSummary = computed(() => interactionsData.value?.crossProjectSummary ?? [])
const access = computed(() => interactionsData.value?.access ?? { canViewAll: false, canEditAll: false })
const primaryContact = computed(() => partner.value?.contacts.find(c => c.isPrimary) ?? partner.value?.contacts[0] ?? null)

// ── Filter ───────────────────────────────────────────────────────────────────

type TypeFilter = 'ALL' | 'NOTE' | 'EMAIL' | 'FULFILLMENT'
const typeFilter = ref<TypeFilter>('ALL')

const filteredInteractions = computed(() => {
  if (typeFilter.value === 'ALL') return interactions.value
  return interactions.value.filter(i => i.type === typeFilter.value)
})

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
  await refreshPartner()
}

async function setPrimary(cId: string) {
  await $fetch(`/api/partners/${id}/contacts/${cId}`, { method: 'PATCH', body: { isPrimary: true } })
  await refreshPartner()
}

async function deleteContact(cId: string) {
  await $fetch(`/api/partners/${id}/contacts/${cId}`, { method: 'DELETE' })
  await refreshPartner()
}

// ── Interaction CRUD ─────────────────────────────────────────────────────────

type NewInteractionMode = null | 'NOTE' | 'EMAIL' | 'FULFILLMENT'
const newMode = ref<NewInteractionMode>(null)

const noteForm = ref({ content: '' })
const mailForm = ref({ direction: 'SENT' as 'SENT' | 'RECEIVED', subject: '', body: '', sentAt: '', fromAddress: '', toAddress: '' })
const fulfillmentForm = ref({ myToThem: '', themToUs: '' })

const editingId = ref<string | null>(null)
const editingContent = ref('')

const statusForm = ref({ actionStatus: null as string | null, dealStage: null as string | null })

// Assignee management
const addAssigneeInteractionId = ref<string | null>(null)
const addAssigneeUserId = ref('')

function resetForms() {
  newMode.value = null
  noteForm.value = { content: '' }
  mailForm.value = { direction: 'SENT', subject: '', body: '', sentAt: '', fromAddress: '', toAddress: '' }
  fulfillmentForm.value = { myToThem: '', themToUs: '' }
}

async function createNote() {
  if (!noteForm.value.content.trim()) return
  await $fetch(`/api/partners/${id}/interactions`, {
    method: 'POST',
    body: { type: 'NOTE', content: noteForm.value.content.trim() },
  })
  resetForms()
  await refresh()
}

async function createEmail() {
  const f = mailForm.value
  if (!f.subject.trim() || !f.sentAt) return
  await $fetch(`/api/partners/${id}/interactions`, {
    method: 'POST',
    body: {
      type: 'EMAIL',
      direction: f.direction,
      subject: f.subject.trim(),
      content: f.body.trim() || null,
      sentAt: f.sentAt,
      fromAddress: f.fromAddress.trim() || null,
      toAddress: f.toAddress.trim() || null,
    },
  })
  resetForms()
  await refresh()
}

async function createFulfillment() {
  await $fetch(`/api/partners/${id}/interactions`, {
    method: 'POST',
    body: {
      type: 'FULFILLMENT',
      myToThem: fulfillmentForm.value.myToThem || null,
      themToUs: fulfillmentForm.value.themToUs || null,
    },
  })
  resetForms()
  await refresh()
}

function startEdit(i: Interaction) {
  editingId.value = i.id
  editingContent.value = i.content ?? ''
}

async function saveEdit() {
  if (!editingId.value) return
  await $fetch(`/api/partners/${id}/interactions/${editingId.value}`, {
    method: 'PATCH',
    body: { content: editingContent.value.trim() || null },
  })
  editingId.value = null
  await refreshInteractions()
}

async function updateStatus(iId: string, field: 'actionStatus' | 'dealStage', value: string | null) {
  await $fetch(`/api/partners/${id}/interactions/${iId}`, {
    method: 'PATCH',
    body: { [field]: value },
  })
  await refreshInteractions()
}

async function updateFulfillment(iId: string, myToThem: string | null, themToUs: string | null) {
  await $fetch(`/api/partners/${id}/interactions/${iId}`, {
    method: 'PATCH',
    body: { myToThem, themToUs },
  })
  await refreshInteractions()
}

async function deleteInteraction(iId: string) {
  await $fetch(`/api/partners/${id}/interactions/${iId}`, { method: 'DELETE' })
  await refresh()
}

async function addAssignee(iId: string) {
  if (!addAssigneeUserId.value) return
  await $fetch(`/api/partners/${id}/interactions/${iId}/assignees`, {
    method: 'POST',
    body: { userId: addAssigneeUserId.value },
  })
  addAssigneeUserId.value = ''
  addAssigneeInteractionId.value = null
  await refreshInteractions()
}

async function removeAssignee(iId: string, userId: string) {
  await $fetch(`/api/partners/${id}/interactions/${iId}/assignees/${userId}`, { method: 'DELETE' })
  await refreshInteractions()
}

function toggleEvent(evId: string) {
  const s = new Set(expandedEvents.value)
  s.has(evId) ? s.delete(evId) : s.add(evId)
  expandedEvents.value = s
}

function unassignedUsersFor(i: Interaction) {
  const assigned = new Set(i.assignees.map(a => a.userId))
  return (allUsers.value ?? []).filter(u => !assigned.has(u.id))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const ACTION_STATUS_LABELS: Record<string, string> = {
  WAITING_FOR_THEM: 'Čekání na ně',
  WAITING_FOR_US: 'Čekání na nás',
  BEFORE_MEETING: 'Před schůzkou',
  NONE: '—',
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
const TYPE_LABELS: Record<string, string> = {
  NOTE: 'Poznámka',
  EMAIL: 'Email',
  FULFILLMENT: 'Plnění',
}
const TYPE_COLORS: Record<string, string> = {
  NOTE: 'bg-violet-100 text-violet-700',
  EMAIL: 'bg-blue-100 text-blue-700',
  FULFILLMENT: 'bg-emerald-100 text-emerald-700',
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

      <!-- Souhrnné přiřazení (read-only) -->
      <div v-if="partner.assignees.length" class="mt-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-gray-400 font-medium">Přiřazeni:</span>
        <div class="flex items-center -space-x-1">
          <template v-for="a in partner.assignees" :key="a.id">
            <img
              v-if="a.image"
              :src="a.image"
              :alt="a.name"
              :title="a.name"
              class="w-7 h-7 rounded-full ring-2 ring-white object-cover"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              :title="a.name"
              class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-xs font-medium"
            >
              {{ a.name.charAt(0).toUpperCase() }}
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Contacts Panel ── -->
    <div v-if="showContactsPanel" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">Emailové adresy</h3>
      <div class="space-y-2 mb-4">
        <div v-for="c in partner.contacts" :key="c.id" class="flex items-center gap-2 text-sm">
          <span :class="['font-mono flex-1 truncate', c.isPrimary ? 'text-gray-800 font-medium' : 'text-gray-500']">{{ c.address }}</span>
          <span v-if="c.label" class="text-xs text-gray-400">{{ c.label }}</span>
          <span v-if="c.isPrimary" class="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">primární</span>
          <button v-else class="text-xs text-gray-400 hover:text-indigo-500 transition-colors" @click="setPrimary(c.id)">nastavit primární</button>
          <button class="text-xs text-gray-300 hover:text-red-400 transition-colors" @click="deleteContact(c.id)">×</button>
        </div>
        <p v-if="!partner.contacts.length" class="text-xs text-gray-400 italic">Žádné emailové adresy</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input v-model="newContactAddress" type="email" placeholder="email@partner.cz" class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-48" @keydown.enter="addContact" />
        <input v-model="newContactLabel" type="text" placeholder="Štítek (volitelný)" class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 w-36" />
        <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input v-model="newContactPrimary" type="checkbox" class="rounded" />
          primární
        </label>
        <button class="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="addContact">Přidat</button>
      </div>
    </div>

    <!-- ── Toolbar ── -->
    <div class="flex items-center justify-between gap-4 mb-6">
      <div class="flex gap-1">
        <button
          v-for="f in (['ALL', 'NOTE', 'EMAIL', 'FULFILLMENT'] as TypeFilter[])"
          :key="f"
          :class="['px-3 py-1.5 text-xs font-medium rounded-lg transition-colors', typeFilter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100']"
          @click="typeFilter = f"
        >{{ f === 'ALL' ? 'Vše' : TYPE_LABELS[f] }}</button>
      </div>
      <div class="flex gap-2">
        <button
          v-for="mode in (['NOTE', 'EMAIL', 'FULFILLMENT'] as const)"
          :key="mode"
          :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', newMode === mode ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
          @click="newMode = newMode === mode ? null : mode"
        >+ {{ TYPE_LABELS[mode] }}</button>
      </div>
    </div>

    <!-- ── New Interaction Forms ── -->
    <!-- NOTE form -->
    <div v-if="newMode === 'NOTE'" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <textarea v-model="noteForm.content" rows="3" placeholder="Nová poznámka..." class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none mb-3" />
      <div class="flex justify-end gap-2">
        <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="resetForms">Zrušit</button>
        <button :disabled="!noteForm.content.trim()" class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors" @click="createNote">Přidat poznámku</button>
      </div>
    </div>

    <!-- EMAIL form -->
    <div v-if="newMode === 'EMAIL'" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div class="flex gap-2">
        <button
          v-for="dir in [{ key: 'SENT', label: 'Odeslali jsme' }, { key: 'RECEIVED', label: 'Obdrželi jsme' }]"
          :key="dir.key"
          :class="['flex-1 text-sm py-2 rounded-lg border transition-colors font-medium', mailForm.direction === dir.key ? (dir.key === 'SENT' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-green-50 border-green-300 text-green-700') : 'border-gray-200 text-gray-500 hover:border-gray-300']"
          @click="mailForm.direction = dir.key as 'SENT' | 'RECEIVED'"
        >{{ dir.label }}</button>
      </div>
      <input v-model="mailForm.subject" type="text" placeholder="Předmět *" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
      <div class="flex gap-2">
        <input v-model="mailForm.sentAt" type="datetime-local" class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
        <input v-model="mailForm.fromAddress" type="email" :placeholder="mailForm.direction === 'SENT' ? 'Od (nás)' : 'Od (partnera)'" class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
        <input v-model="mailForm.toAddress" type="email" :placeholder="mailForm.direction === 'SENT' ? 'Komu (partner)' : 'Komu (nás)'" class="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300" />
      </div>
      <textarea v-model="mailForm.body" rows="3" placeholder="Text emailu (volitelný)" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none" />
      <div class="flex justify-end gap-2">
        <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="resetForms">Zrušit</button>
        <button :disabled="!mailForm.subject.trim() || !mailForm.sentAt" class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors" @click="createEmail">Uložit email</button>
      </div>
    </div>

    <!-- FULFILLMENT form -->
    <div v-if="newMode === 'FULFILLMENT'" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
        <div>
          <label class="text-xs font-medium text-blue-700 mb-1 block">My jim</label>
          <textarea v-model="fulfillmentForm.myToThem" rows="4" placeholder="Co jsme slíbili / dodali..." class="w-full text-sm px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none bg-white" />
        </div>
        <div>
          <label class="text-xs font-medium text-green-700 mb-1 block">Oni nám</label>
          <textarea v-model="fulfillmentForm.themToUs" rows="4" placeholder="Co nám slíbili / dodali..." class="w-full text-sm px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:border-green-400 resize-none bg-white" />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="resetForms">Zrušit</button>
        <button class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="createFulfillment">Přidat plnění</button>
      </div>
    </div>

    <!-- ── Interaction List ── -->
    <div class="space-y-3">
      <div
        v-for="i in filteredInteractions"
        :key="i.id"
        :class="[
          'bg-white border rounded-xl p-4 transition-colors',
          i.type === 'EMAIL' && i.direction === 'SENT' ? 'border-blue-100' :
          i.type === 'EMAIL' && i.direction === 'RECEIVED' ? 'border-green-100' :
          i.type === 'FULFILLMENT' ? 'border-emerald-100' :
          'border-gray-200',
        ]"
      >
        <!-- Header row -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[i.type]]">{{ TYPE_LABELS[i.type] }}</span>
            <span v-if="i.type === 'EMAIL' && i.direction" :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', i.direction === 'SENT' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600']">
              {{ i.direction === 'SENT' ? '↑ Odesláno' : '↓ Obdrženo' }}
            </span>
            <span v-if="i.dealStage" :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', DEAL_STAGE_COLORS[i.dealStage] ?? 'bg-gray-100 text-gray-600']">{{ DEAL_STAGE_LABELS[i.dealStage] ?? i.dealStage }}</span>
            <span v-if="i.actionStatus && i.actionStatus !== 'NONE'" class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-600">{{ ACTION_STATUS_LABELS[i.actionStatus] }}</span>
          </div>
          <div v-if="i.canEdit" class="flex items-center gap-1 flex-shrink-0">
            <button v-if="i.type === 'NOTE'" class="text-xs text-gray-300 hover:text-indigo-500 transition-colors" @click="startEdit(i)">upravit</button>
            <button class="text-xs text-gray-300 hover:text-red-400 transition-colors" @click="deleteInteraction(i.id)">smazat</button>
          </div>
        </div>

        <!-- Email subject -->
        <p v-if="i.type === 'EMAIL' && i.subject" class="text-sm font-medium text-gray-800 mb-1 cursor-pointer" @click="toggleEvent(i.id)">{{ i.subject }}</p>

        <!-- Note / Email body -->
        <div v-if="editingId === i.id">
          <textarea v-model="editingContent" rows="3" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none" />
          <div class="flex gap-2 mt-2">
            <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="saveEdit">Uložit</button>
            <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors" @click="editingId = null">Zrušit</button>
          </div>
        </div>
        <template v-else>
          <p v-if="i.type === 'NOTE' && i.content" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{{ i.content }}</p>
          <div v-if="i.type === 'EMAIL' && expandedEvents.has(i.id) && i.content" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed mt-2 pt-2 border-t border-gray-100">{{ i.content }}</div>
        </template>

        <!-- Fulfillment content -->
        <div v-if="i.type === 'FULFILLMENT'" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
          <div class="bg-blue-50 rounded-lg p-3">
            <h4 class="text-xs font-semibold text-blue-800 mb-1">My jim</h4>
            <p v-if="i.myToThem" class="text-sm text-gray-700 whitespace-pre-wrap">{{ i.myToThem }}</p>
            <p v-else class="text-xs text-gray-400 italic">Nevyplněno</p>
          </div>
          <div class="bg-green-50 rounded-lg p-3">
            <h4 class="text-xs font-semibold text-green-800 mb-1">Oni nám</h4>
            <p v-if="i.themToUs" class="text-sm text-gray-700 whitespace-pre-wrap">{{ i.themToUs }}</p>
            <p v-else class="text-xs text-gray-400 italic">Nevyplněno</p>
          </div>
        </div>

        <!-- Footer: meta + assignees + status controls -->
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <img
            v-if="i.creator.image"
            :src="i.creator.image"
            :alt="i.creator.name"
            :title="i.creator.name"
            class="w-5 h-5 rounded-full object-cover"
            referrerpolicy="no-referrer"
          />
          <span class="text-xs text-gray-400">{{ i.creator.name }}</span>
          <span class="text-xs text-gray-300">{{ fmtDate(i.type === 'EMAIL' && i.sentAt ? i.sentAt : i.createdAt) }}</span>
          <span v-if="i.createdAt !== i.updatedAt" class="text-xs text-gray-300">(upraveno)</span>

          <!-- Assignee chips -->
          <div class="flex items-center gap-1 ml-auto">
            <template v-for="a in i.assignees" :key="a.userId">
              <button
                v-if="i.canEdit"
                class="group relative"
                :title="a.user.name"
                @click="removeAssignee(i.id, a.userId)"
              >
                <img v-if="a.user.image" :src="a.user.image" :alt="a.user.name" class="w-5 h-5 rounded-full ring-1 ring-white object-cover group-hover:opacity-60" referrerpolicy="no-referrer" />
                <div v-else class="w-5 h-5 rounded-full ring-1 ring-white bg-indigo-400 flex items-center justify-center text-white text-[9px] font-medium group-hover:opacity-60">{{ a.user.name.charAt(0).toUpperCase() }}</div>
                <span class="absolute -top-0.5 -right-0.5 hidden group-hover:flex w-3 h-3 bg-red-400 rounded-full items-center justify-center text-white text-[7px]">×</span>
              </button>
              <span v-else :title="a.user.name">
                <img v-if="a.user.image" :src="a.user.image" :alt="a.user.name" class="w-5 h-5 rounded-full ring-1 ring-white object-cover" referrerpolicy="no-referrer" />
                <div v-else class="w-5 h-5 rounded-full ring-1 ring-white bg-indigo-400 flex items-center justify-center text-white text-[9px] font-medium">{{ a.user.name.charAt(0).toUpperCase() }}</div>
              </span>
            </template>
            <button
              v-if="i.canEdit && addAssigneeInteractionId !== i.id"
              class="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-300 text-[10px] transition-colors"
              @click="addAssigneeInteractionId = i.id"
            >+</button>
            <select
              v-if="addAssigneeInteractionId === i.id"
              v-model="addAssigneeUserId"
              class="text-xs px-1.5 py-0.5 border border-gray-200 rounded text-gray-500 focus:outline-none focus:border-indigo-300 bg-white"
              @change="addAssignee(i.id)"
              @blur="addAssigneeInteractionId = null"
            >
              <option value="">Přidat...</option>
              <option v-for="u in unassignedUsersFor(i)" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
          </div>
        </div>

        <!-- Status controls (inline) -->
        <div v-if="i.canEdit" class="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-gray-400">Stav:</span>
            <select
              :value="i.dealStage ?? ''"
              class="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-600 focus:outline-none focus:border-indigo-300 bg-white"
              @change="updateStatus(i.id, 'dealStage', ($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">—</option>
              <option v-for="(label, key) in DEAL_STAGE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-gray-400">Akce:</span>
            <select
              :value="i.actionStatus ?? ''"
              class="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded text-gray-600 focus:outline-none focus:border-indigo-300 bg-white"
              @change="updateStatus(i.id, 'actionStatus', ($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">—</option>
              <option v-for="(label, key) in ACTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
        </div>
      </div>

      <p v-if="!filteredInteractions.length" class="text-center py-16 text-gray-300 text-sm">
        {{ typeFilter === 'ALL' ? 'Zatím žádná jednání — přidejte první interakci' : 'Žádná jednání tohoto typu' }}
      </p>
    </div>

    <!-- ── Cross-Project Visibility ── -->
    <div v-if="crossProjectSummary.length" class="mt-8">
      <button
        class="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3"
        @click="showCrossProject = !showCrossProject"
      >
        <span>{{ showCrossProject ? '▾' : '▸' }}</span>
        <span>Ostatní projekty ({{ crossProjectSummary.length }})</span>
      </button>
      <div v-if="showCrossProject" class="space-y-2">
        <div
          v-for="cp in crossProjectSummary"
          :key="cp.projectId"
          class="bg-gray-50 border border-gray-100 rounded-lg p-3"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-700">{{ cp.projectName }}</span>
            <span class="text-xs text-gray-400">{{ cp.interactionCount }} jednání</span>
          </div>
          <div class="flex items-center gap-3 flex-wrap text-xs text-gray-500">
            <span v-if="cp.lastActivityAt">Poslední aktivita: {{ fmtDateShort(cp.lastActivityAt) }}</span>
            <span v-for="ds in cp.dealStages" :key="ds" :class="['px-1.5 py-0.5 rounded', DEAL_STAGE_COLORS[ds] ?? 'bg-gray-100 text-gray-600']">{{ DEAL_STAGE_LABELS[ds] ?? ds }}</span>
            <span v-if="cp.assigneeNames.length" class="text-gray-400">{{ cp.assigneeNames.join(', ') }}</span>
          </div>
        </div>
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
