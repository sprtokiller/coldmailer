<script setup lang="ts">
import { sanitizeEmailHtml } from '~/utils/html-normalize'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact { id: string; address: string; label: string | null; firstName: string | null; lastName: string | null; role: string | null; contactType: string | null; priority: number; note: string | null; isPrimary: boolean }
interface AssigneeUser { id: string; name: string; image: string | null }
interface InteractionAssignee { userId: string; user: AssigneeUser }
interface Interaction {
  id: string
  type: 'NOTE' | 'EMAIL' | 'FULFILLMENT'
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
  isUnknownContact: boolean
  unknownContactAddress: string | null
}
interface CrossProjectMeta {
  projectId: string
  projectName: string
  interactionCount: number
  lastActivityAt: string | null
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
  actionStatus: 'WAITING_FOR_THEM' | 'WAITING_FOR_US' | 'BEFORE_MEETING' | 'NONE' | null
  dealStage: 'CONTACTED' | 'NEGOTIATING' | 'NOT_INTERESTED' | 'NOT_THIS_TIME' | 'PARTNER' | 'COMPLETED' | null
}
interface AppUser { id: string; name: string; image: string | null; email: string }

// ── Data ─────────────────────────────────────────────────────────────────────

const { data: partner, refresh: refreshPartner } = await useFetch<Partner>(`/api/partners/${id}`)
const { data: interactionsData, refresh: refreshInteractions } = await useFetch<InteractionsResponse>(`/api/partners/${id}/interactions`)
const { data: blacklistData, refresh: refreshBlacklist } = await useFetch<{
  blacklist: string[]
  emailDisplayMode: string
  domains: string[]
  additionalAddresses: string[]
  autoIncludeDomain: boolean
  detectedDomain: string | null
}>(`/api/partners/${id}/blacklist`)
const { data: allUsers } = await useFetch<AppUser[]>('/api/users')
const { user: me } = useUserSession()
const canEditPartner = ref(true)

async function refresh() {
  await Promise.all([refreshPartner(), refreshInteractions(), refreshBlacklist()])
}

// ── Sync ─────────────────────────────────────────────────────────────────────

const toast = useToast()
const syncing = ref(false)
const showSyncDropdown = ref(false)
const syncLookbackDays = ref(90)

async function syncNow(lookbackDays?: number) {
  syncing.value = true
  showSyncDropdown.value = false
  try {
    const body = lookbackDays ? { lookbackDays } : {}
    const res = await $fetch<{ synced: number; skipped?: string }>('/api/gmail/sync', { method: 'POST', body })
    if (res.skipped) {
      const reason = res.skipped === 'debounced' ? 'Počkej 30 sekund mezi syncy'
        : res.skipped === 'no-token' ? 'Chybí Google token — přihlas se znovu'
        : res.skipped === 'auth-error' ? 'Chyba autorizace Google'
        : res.skipped === 'error' ? 'Chyba při načítání Gmailu'
        : res.skipped
      toast.show(`Sync přeskočen: ${reason}`, 'info')
    } else {
      const n = res.synced
      const word = n === 1 ? 'email' : n >= 2 && n <= 4 ? 'emaily' : 'emailů'
      toast.show(`Synchronizováno ${n} ${word}`, 'success')
    }
    await Promise.all([refreshInteractions(), refreshPartner()])
  } catch {
    toast.show('Sync selhal', 'error')
  } finally {
    syncing.value = false
  }
}

// ── UI state ──────────────────────────────────────────────────────────────────

onMounted(() => {
  document.addEventListener('click', () => { showSyncDropdown.value = false })
})

const showProfileModal = ref(false)
const showEditModal = ref(false)
const expandedEvents = ref(new Set<string>())
const showCrossProject = ref(false)

// ── Computed ─────────────────────────────────────────────────────────────────

const interactions = computed(() => interactionsData.value?.items ?? [])
const crossProjectSummary = computed(() => interactionsData.value?.crossProjectSummary ?? [])
const access = computed(() => interactionsData.value?.access ?? { canViewAll: false, canEditAll: false })
const primaryContact = computed(() => partner.value?.contacts.find(c => c.isPrimary) ?? partner.value?.contacts[0] ?? null)

// ── Unknown contacts ─────────────────────────────────────────────────────────

const unknownContacts = computed(() => {
  const byEmail = new Map<string, Interaction[]>()
  for (const i of interactions.value) {
    if (i.isUnknownContact && i.unknownContactAddress) {
      const list = byEmail.get(i.unknownContactAddress) ?? []
      list.push(i)
      byEmail.set(i.unknownContactAddress, list)
    }
  }
  return byEmail
})

const unknownContactActionLoading = ref<string | null>(null)

async function handleUnknownContactAction(action: 'dismiss' | 'blacklist' | 'add_contact', email: string, extra?: { firstName?: string; lastName?: string; role?: string }) {
  unknownContactActionLoading.value = email
  try {
    await $fetch(`/api/partners/${id}/unknown-contact-action`, {
      method: 'POST',
      body: { action, email, ...extra },
    })
    await refresh()
  } finally {
    unknownContactActionLoading.value = null
  }
}

const addContactForm = ref<{ email: string; firstName: string; lastName: string; role: string } | null>(null)

function openAddContactForm(email: string) {
  addContactForm.value = { email, firstName: '', lastName: '', role: '' }
}

async function submitAddContact() {
  if (!addContactForm.value) return
  await handleUnknownContactAction('add_contact', addContactForm.value.email, {
    firstName: addContactForm.value.firstName || undefined,
    lastName: addContactForm.value.lastName || undefined,
    role: addContactForm.value.role || undefined,
  })
  addContactForm.value = null
}

// ── Blacklist management ─────────────────────────────────────────────────────

const blacklist = computed(() => blacklistData.value?.blacklist ?? [])
const showBlacklist = ref(false)
const newBlacklistEmail = ref('')
const blacklistError = ref('')

async function addToBlacklist() {
  blacklistError.value = ''
  const email = newBlacklistEmail.value.trim().toLowerCase()
  if (!email) return
  if (additionalAddresses.value.includes(email)) {
    blacklistError.value = `${email} je v přídavných adresách — nejprve ji odeberte.`
    return
  }
  const updated = [...blacklist.value, email]
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { contactBlacklist: updated },
  })
  newBlacklistEmail.value = ''
  await refreshBlacklist()
}

async function removeFromBlacklist(email: string) {
  const updated = blacklist.value.filter(e => e !== email)
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { contactBlacklist: updated.length ? updated : null },
  })
  await refreshBlacklist()
}

// ── Additional addresses (whitelist) management ──────────────────────────────

const additionalAddresses = computed(() => blacklistData.value?.additionalAddresses ?? [])
const autoIncludeDomain = computed(() => blacklistData.value?.autoIncludeDomain ?? false)
const detectedDomain = computed(() => blacklistData.value?.detectedDomain ?? null)
const showAdditionalAddresses = ref(false)
const newAdditionalEmail = ref('')
const additionalError = ref('')

async function addAdditionalAddress() {
  additionalError.value = ''
  const email = newAdditionalEmail.value.trim().toLowerCase()
  if (!email) return
  if (blacklist.value.includes(email)) {
    additionalError.value = `${email} je na blacklistu — nejprve ji odeberte.`
    return
  }
  const updated = [...additionalAddresses.value, email]
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { additionalAddresses: updated },
  })
  newAdditionalEmail.value = ''
  await refreshBlacklist()
}

async function removeAdditionalAddress(email: string) {
  const updated = additionalAddresses.value.filter(e => e !== email)
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { additionalAddresses: updated.length ? updated : null },
  })
  await refreshBlacklist()
}

async function toggleAutoIncludeDomain() {
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { autoIncludeDomain: !autoIncludeDomain.value },
  })
  await refreshBlacklist()
}

// ── Email display mode ───────────────────────────────────────────────────────

const emailDisplayMode = computed(() => blacklistData.value?.emailDisplayMode ?? 'text')

async function toggleEmailDisplayMode() {
  const newMode = emailDisplayMode.value === 'text' ? 'html' : 'text'
  await $fetch(`/api/partners/${id}/settings`, {
    method: 'PATCH',
    body: { emailDisplayMode: newMode },
  })
  await refreshBlacklist()
}

function stripHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}

// ── Filter ───────────────────────────────────────────────────────────────────

type TypeFilter = 'NOTE' | 'EMAIL' | 'FULFILLMENT'
const typeFilter = ref<TypeFilter>('EMAIL')

const filteredInteractions = computed(() => {
  if (typeFilter.value === 'FULFILLMENT') {
    return interactions.value.filter(i => (i.type === 'FULFILLMENT' || i.type === 'NOTE') && !i.isUnknownContact)
  }
  return interactions.value.filter(i => i.type === typeFilter.value && !i.isUnknownContact)
})

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
  const toAddr = f.toAddress.trim().toLowerCase()
  await $fetch(`/api/partners/${id}/interactions`, {
    method: 'POST',
    body: {
      type: 'EMAIL',
      direction: f.direction,
      subject: f.subject.trim(),
      content: f.body.trim() || null,
      sentAt: f.sentAt,
      fromAddress: f.fromAddress.trim() || null,
      toAddress: toAddr || null,
    },
  })
  if (toAddr && !partner.value?.contacts.some(c => c.address === toAddr)) {
    await $fetch(`/api/partners/${id}/contacts`, {
      method: 'POST',
      body: { address: toAddr },
    }).catch(() => {})
  }
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

// ── Fulfillment inline editing ───────────────────────────────────────────────

const fulfillmentEditingField = ref<{ id: string; field: 'myToThem' | 'themToUs'; value: string } | null>(null)
const fulfillmentTextarea = ref<HTMLTextAreaElement[] | null>(null)

function toLines(text: string): string[] {
  return text.split('\n').filter(l => l.trim())
}

function startFulfillmentEdit(i: Interaction, field: 'myToThem' | 'themToUs') {
  fulfillmentEditingField.value = { id: i.id, field, value: i[field] ?? '' }
  nextTick(() => {
    fulfillmentTextarea.value?.[0]?.focus()
  })
}

async function saveFulfillmentField(interactionId: string) {
  if (!fulfillmentEditingField.value || fulfillmentEditingField.value.id !== interactionId) return
  const { field, value } = fulfillmentEditingField.value
  fulfillmentEditingField.value = null
  await $fetch(`/api/partners/${id}/interactions/${interactionId}`, {
    method: 'PATCH',
    body: { [field]: value.trim() || null },
  })
  await refreshInteractions()
}

async function updateStatus(field: 'actionStatus' | 'dealStage', value: string | null) {
  await $fetch(`/api/partners/${id}/status`, {
    method: 'PATCH',
    body: { [field]: value },
  })
  await refreshPartner()
}


async function deleteInteraction(iId: string) {
  if (!confirm('Opravdu chcete smazat tuto položku? Tato akce je nevratná.')) return
  await $fetch(`/api/partners/${id}/interactions/${iId}`, { method: 'DELETE' })
  await refresh()
}

const showAddAssignee = ref(false)

async function addSolutionAssignee() {
  if (!addAssigneeUserId.value) return
  await $fetch(`/api/partners/${id}/status`, {
    method: 'PATCH',
    body: { addAssigneeId: addAssigneeUserId.value },
  })
  addAssigneeUserId.value = ''
  showAddAssignee.value = false
  await refreshPartner()
}

async function removeSolutionAssignee(userId: string) {
  if (!confirm('Odstranit tohoto uživatele z řešitelů partnera?')) return
  await $fetch(`/api/partners/${id}/status`, {
    method: 'PATCH',
    body: { removeAssigneeId: userId },
  })
  await refreshPartner()
}

function toggleEvent(evId: string) {
  const s = new Set(expandedEvents.value)
  s.has(evId) ? s.delete(evId) : s.add(evId)
  expandedEvents.value = s
}

const unassignedSolutionUsers = computed(() => {
  const assigned = new Set(partner.value?.assignees.map(a => a.id))
  return (allUsers.value ?? []).filter(u => !assigned.has(u.id))
})

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
  NONE: 'Už nic',
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
  NOTE: 'Poznámky',
  EMAIL: 'Email',
  FULFILLMENT: 'Obsah plnění',
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
          <div class="relative flex">
            <button
              class="text-xs px-3 py-1.5 rounded-l-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              :disabled="syncing"
              @click="syncNow()"
            >
              <svg v-if="syncing" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {{ syncing ? 'Sync...' : 'Sync' }}
            </button>
            <button
              class="text-xs px-1.5 py-1.5 rounded-r-lg border border-l-0 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              :disabled="syncing"
              @click.stop="showSyncDropdown = !showSyncDropdown"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div v-if="showSyncDropdown" class="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-64" @click.stop>
              <h4 class="text-xs font-medium text-gray-700 mb-2">Hloubka synchronizace</h4>
              <p class="text-[11px] text-gray-400 mb-3">Znovu načte maily z minulosti. Duplikáty se nevytvoří.</p>
              <div class="flex items-center gap-2 mb-3">
                <input v-model.number="syncLookbackDays" type="number" min="1" max="365" class="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 text-center" />
                <span class="text-xs text-gray-500">dní zpět</span>
              </div>
              <div class="flex gap-1 mb-3">
                <button v-for="d in [30, 90, 180, 365]" :key="d" class="text-[10px] px-2 py-1 rounded border transition-colors" :class="syncLookbackDays === d ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'" @click="syncLookbackDays = d">{{ d }}d</button>
              </div>
              <button
                :disabled="syncing"
                class="w-full text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                @click="syncNow(syncLookbackDays)"
              >Synchronizovat {{ syncLookbackDays }} dní zpět</button>
            </div>
          </div>
          <button
            v-if="partner.payload.description"
            class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            @click="showProfileModal = true"
          >
            Profil
          </button>
          <button
            v-if="canEditPartner"
            class="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            @click="showEditModal = true"
          >
            Upravit profil
          </button>
        </div>
      </div>

      <!-- Partner Status (Pipeline) -->
      <div v-if="canEditPartner || partner.dealStage || partner.actionStatus" class="mt-4 flex items-center gap-4 p-3 bg-gray-50 border border-gray-100 rounded-lg w-max">
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 font-medium">Fáze:</span>
          <select
            v-if="canEditPartner"
            :value="partner.dealStage ?? ''"
            class="text-xs px-2 py-1 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-indigo-300 bg-white min-w-32"
            @change="updateStatus('dealStage', ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">—</option>
            <option v-for="(label, key) in DEAL_STAGE_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <span v-else :class="['text-xs px-2 py-1 rounded font-medium', DEAL_STAGE_COLORS[partner.dealStage ?? ''] ?? 'bg-gray-100 text-gray-600']">{{ partner.dealStage ? DEAL_STAGE_LABELS[partner.dealStage] : '—' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 font-medium">Stav:</span>
          <select
            v-if="canEditPartner"
            :value="partner.actionStatus ?? ''"
            class="text-xs px-2 py-1 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-indigo-300 bg-white min-w-32"
            @change="updateStatus('actionStatus', ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">—</option>
            <option v-for="(label, key) in ACTION_STATUS_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <span v-else class="text-xs px-2 py-1 rounded font-medium bg-gray-100 text-gray-600">{{ partner.actionStatus ? ACTION_STATUS_LABELS[partner.actionStatus] : '—' }}</span>
        </div>
      </div>

      <!-- Souhrnné přiřazení -->
      <div v-if="partner.assignees.length || canEditPartner" class="mt-4 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-gray-400 font-medium">Přiřazeni:</span>
        <div class="flex items-center gap-1">
          <template v-for="a in partner.assignees" :key="a.id">
            <button
              v-if="canEditPartner"
              class="group relative"
              :title="a.name"
              @click="removeSolutionAssignee(a.id)"
            >
              <img v-if="a.image" :src="a.image" :alt="a.name" class="w-7 h-7 rounded-full ring-2 ring-white object-cover group-hover:opacity-60" referrerpolicy="no-referrer" />
              <div v-else class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-[11px] font-medium group-hover:opacity-60">{{ a.name.charAt(0).toUpperCase() }}</div>
              <span class="absolute -top-0.5 -right-0.5 hidden group-hover:flex w-3.5 h-3.5 bg-red-400 rounded-full items-center justify-center text-white text-[9px]">×</span>
            </button>
            <span v-else :title="a.name">
              <img v-if="a.image" :src="a.image" :alt="a.name" class="w-7 h-7 rounded-full ring-2 ring-white object-cover" referrerpolicy="no-referrer" />
              <div v-else class="w-7 h-7 rounded-full ring-2 ring-white bg-indigo-400 flex items-center justify-center text-white text-[11px] font-medium">{{ a.name.charAt(0).toUpperCase() }}</div>
            </span>
          </template>
          <button
            v-if="canEditPartner && !showAddAssignee"
            class="w-7 h-7 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-300 text-xs transition-colors ml-1"
            @click="showAddAssignee = true"
          >+</button>
          <select
            v-if="showAddAssignee"
            v-model="addAssigneeUserId"
            class="text-xs px-1.5 py-0.5 ml-1 border border-gray-200 rounded text-gray-500 focus:outline-none focus:border-indigo-300 bg-white"
            @change="addSolutionAssignee"
            @blur="showAddAssignee = false"
          >
            <option value="">Přidat...</option>
            <option v-for="u in unassignedSolutionUsers" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ── Toolbar ── -->
    <div class="flex items-center justify-between gap-4 mb-6">
      <div class="flex gap-1">
        <button
          v-for="f in (['EMAIL', 'NOTE', 'FULFILLMENT'] as TypeFilter[])"
          :key="f"
          :class="['px-3 py-1.5 text-xs font-medium rounded-lg transition-colors', typeFilter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100']"
          @click="typeFilter = f"
        >{{ TYPE_LABELS[f] }}</button>
      </div>

      <div class="flex items-center gap-2 ml-auto">
        <button
          v-if="typeFilter === 'NOTE'"
          class="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          @click="newMode = newMode === 'NOTE' ? null : 'NOTE'"
        >{{ newMode === 'NOTE' ? 'Zrušit' : '+ Poznámka' }}</button>

        <div v-if="typeFilter === 'EMAIL'" class="flex items-center border border-gray-200 rounded-lg overflow-hidden">
        <button
          :class="['px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1', emailDisplayMode === 'text' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600']"
          title="Textový režim"
          @click="emailDisplayMode !== 'text' && toggleEmailDisplayMode()"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10" /></svg>
          Text
        </button>
        <button
          :class="['px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 border-l border-gray-200', emailDisplayMode === 'html' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600']"
          title="HTML náhled"
          @click="emailDisplayMode !== 'html' && toggleEmailDisplayMode()"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          HTML
        </button>
      </div>
      </div>
    </div>

    <!-- ── Unknown Contact Warnings ── -->
    <div v-if="unknownContacts.size > 0" class="mb-6 space-y-3">
      <div
        v-for="[email, emails] of unknownContacts"
        :key="email"
        class="bg-amber-50 border border-amber-200 rounded-xl p-4"
      >
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-amber-800">
              Neznámý kontakt: <span class="font-mono">{{ email }}</span>
            </p>
            <p class="text-xs text-amber-600 mt-0.5">
              Nalezeno {{ emails.length }} {{ emails.length === 1 ? 'email' : emails.length < 5 ? 'emaily' : 'emailů' }} se shodnou doménou.
              Přidat jako kontakt partnera?
            </p>

            <!-- Add contact inline form -->
            <div v-if="addContactForm?.email === email" class="mt-3 bg-white border border-amber-100 rounded-lg p-3 space-y-2">
              <div class="flex gap-2">
                <input v-model="addContactForm.firstName" type="text" placeholder="Jméno" class="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
                <input v-model="addContactForm.lastName" type="text" placeholder="Příjmení" class="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
                <input v-model="addContactForm.role" type="text" placeholder="Pozice" class="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-300" />
              </div>
              <div class="flex justify-end gap-2">
                <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="addContactForm = null">Zrušit</button>
                <button
                  :disabled="unknownContactActionLoading === email"
                  class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  @click="submitAddContact"
                >Uložit kontakt</button>
              </div>
            </div>

            <!-- Action buttons -->
            <div v-else class="flex items-center gap-2 mt-3">
              <button
                :disabled="unknownContactActionLoading === email"
                class="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                @click="handleUnknownContactAction('dismiss', email)"
              >Ne</button>
              <button
                :disabled="unknownContactActionLoading === email"
                class="text-xs px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 transition-colors"
                @click="handleUnknownContactAction('blacklist', email)"
              >Ne, již neupozorňovat</button>
              <button
                :disabled="unknownContactActionLoading === email"
                class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                @click="openAddContactForm(email)"
              >Ano, přidat kontakt</button>
              <svg v-if="unknownContactActionLoading === email" class="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            </div>
          </div>
        </div>
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
        <div class="flex-1 relative">
          <input
            v-model="mailForm.toAddress"
            type="email"
            list="partner-contacts-list"
            :placeholder="mailForm.direction === 'SENT' ? 'Komu (partner)' : 'Komu (nás)'"
            class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
          />
          <datalist id="partner-contacts-list">
            <option v-for="c in partner.contacts" :key="c.id" :value="c.address">
              {{ [c.firstName, c.lastName].filter(Boolean).join(' ') }}{{ c.role ? ` — ${c.role}` : '' }}
            </option>
          </datalist>
        </div>
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
        <button class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="createFulfillment">Přidat obsah plnění</button>
      </div>
    </div>

    <!-- ── Interaction List ── -->
    <div class="space-y-3">
      <div
        v-for="i in filteredInteractions"
        :key="i.id"
        :class="[
          'bg-white border rounded-xl p-4 transition-colors',
          i.type === 'EMAIL' && i.direction === 'SENT' ? 'border-blue-100 cursor-pointer' :
          i.type === 'EMAIL' && i.direction === 'RECEIVED' ? 'border-green-100 cursor-pointer' :
          i.type === 'FULFILLMENT' ? 'border-emerald-100' :
          'border-gray-200',
        ]"
        @click="i.type === 'EMAIL' && toggleEvent(i.id)"
      >
        <!-- Header row -->
        <div v-if="i.type !== 'FULFILLMENT'" class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <span v-if="i.type === 'EMAIL' && i.direction" :class="['text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', i.direction === 'SENT' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600']">
              {{ i.direction === 'SENT' ? '↑ Odesláno' : '↓ Obdrženo' }}
            </span>
            <span v-if="i.type === 'NOTE' && typeFilter === 'FULFILLMENT'" class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-50 text-violet-600 shrink-0">Poznámka</span>
            <img v-if="i.creator.image" :src="i.creator.image" :alt="i.creator.name" :title="i.creator.name" class="w-4 h-4 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" />
            <div v-else :title="i.creator.name" class="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ i.creator.name.charAt(0).toUpperCase() }}</div>
            <template v-for="a in i.assignees" :key="a.userId">
              <span class="text-gray-300">+</span>
              <img v-if="a.user.image" :src="a.user.image" :alt="a.user.name" :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white object-cover shrink-0" referrerpolicy="no-referrer" />
              <div v-else :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white bg-indigo-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ a.user.name.charAt(0).toUpperCase() }}</div>
            </template>
            <span class="truncate">{{ i.creator.name }}</span>
            <span class="text-gray-300 shrink-0">&middot;</span>
            <span class="text-gray-300 shrink-0">{{ fmtDate(i.type === 'EMAIL' && i.sentAt ? i.sentAt : i.createdAt) }}</span>
            <span v-if="i.createdAt !== i.updatedAt" class="text-gray-300 shrink-0">(upraveno)</span>
          </div>
          <div v-if="i.canEdit" class="flex items-center gap-1 flex-shrink-0">
            <button v-if="i.type === 'NOTE'" class="text-xs text-gray-300 hover:text-indigo-500 transition-colors" @click.stop="startEdit(i)">upravit</button>
            <button class="text-xs text-gray-300 hover:text-red-400 transition-colors" @click.stop="deleteInteraction(i.id)">smazat</button>
          </div>
        </div>

        <!-- Email subject -->
        <p v-if="i.type === 'EMAIL' && i.subject" class="text-sm font-medium text-gray-800 mb-1">{{ i.subject }}</p>

        <!-- Note / Email body -->
        <div v-if="editingId === i.id && i.type === 'NOTE'">
          <textarea v-model="editingContent" rows="3" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none" />
          <div class="flex gap-2 mt-2">
            <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="saveEdit">Uložit</button>
            <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors" @click="editingId = null">Zrušit</button>
          </div>
        </div>
        <template v-else>
          <p v-if="i.type === 'NOTE' && i.content" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{{ i.content }}</p>
          <div v-if="i.type === 'EMAIL' && expandedEvents.has(i.id) && i.content" class="mt-2 pt-2 border-t border-gray-100">
            <div v-if="emailDisplayMode === 'html'" class="email-html-preview text-sm text-gray-700 leading-relaxed" v-html="sanitizeEmailHtml(i.content)" />
            <div v-else class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{{ stripHtml(i.content) }}</div>
          </div>
        </template>

        <!-- Fulfillment content — always editable -->
        <div v-if="i.type === 'FULFILLMENT'" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <h4 class="text-xs font-semibold text-blue-800 mb-1">My jim</h4>
            <div v-if="fulfillmentEditingField?.id === i.id && fulfillmentEditingField?.field === 'myToThem'">
              <textarea
                ref="fulfillmentTextarea"
                :value="fulfillmentEditingField.value"
                rows="4"
                placeholder="Každý řádek = jedna položka..."
                class="w-full text-sm px-3 py-2 border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none bg-white"
                @input="fulfillmentEditingField!.value = ($event.target as HTMLTextAreaElement).value"
                @blur="saveFulfillmentField(i.id)"
                @keydown.escape="fulfillmentEditingField = null"
              />
            </div>
            <div v-else class="bg-blue-50 rounded-lg p-3 min-h-[3rem] cursor-text" @click="startFulfillmentEdit(i, 'myToThem')">
              <ul v-if="i.myToThem" class="list-disc list-inside space-y-0.5">
                <li v-for="(line, li) in toLines(i.myToThem)" :key="li" class="text-sm text-gray-700">{{ line }}</li>
              </ul>
              <p v-else class="text-xs text-gray-400 italic">Klikněte pro přidání...</p>
            </div>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-green-800 mb-1">Oni nám</h4>
            <div v-if="fulfillmentEditingField?.id === i.id && fulfillmentEditingField?.field === 'themToUs'">
              <textarea
                ref="fulfillmentTextarea"
                :value="fulfillmentEditingField.value"
                rows="4"
                placeholder="Každý řádek = jedna položka..."
                class="w-full text-sm px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:border-green-400 resize-none bg-white"
                @input="fulfillmentEditingField!.value = ($event.target as HTMLTextAreaElement).value"
                @blur="saveFulfillmentField(i.id)"
                @keydown.escape="fulfillmentEditingField = null"
              />
            </div>
            <div v-else class="bg-green-50 rounded-lg p-3 min-h-[3rem] cursor-text" @click="startFulfillmentEdit(i, 'themToUs')">
              <ul v-if="i.themToUs" class="list-disc list-inside space-y-0.5">
                <li v-for="(line, li) in toLines(i.themToUs)" :key="li" class="text-sm text-gray-700">{{ line }}</li>
              </ul>
              <p v-else class="text-xs text-gray-400 italic">Klikněte pro přidání...</p>
            </div>
          </div>
        </div>

      </div>

      <p v-if="!filteredInteractions.length" class="text-center py-16 text-gray-300 text-sm">
        Žádná jednání tohoto typu
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
            <span v-if="cp.assigneeNames.length" class="text-gray-400">{{ cp.assigneeNames.join(', ') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Email contact management ── -->
    <div v-if="typeFilter === 'EMAIL'" class="mt-8 space-y-4">

      <!-- Auto-include domain toggle -->
      <div v-if="detectedDomain" class="flex items-center justify-between gap-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <div class="flex items-center gap-3 min-w-0">
          <div>
            <p class="text-xs font-medium text-gray-700">Automaticky zahrnout doménu</p>
            <p class="text-[11px] text-gray-400 mt-0.5">Sledovat emaily s doménou <span class="font-mono text-indigo-600">@{{ detectedDomain }}</span></p>
          </div>
        </div>
        <button
          :class="[
            'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            autoIncludeDomain ? 'bg-indigo-600' : 'bg-gray-200'
          ]"
          role="switch"
          :aria-checked="autoIncludeDomain"
          @click="toggleAutoIncludeDomain"
        >
          <span
            :class="[
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
              autoIncludeDomain ? 'translate-x-4' : 'translate-x-0'
            ]"
          />
        </button>
      </div>

      <!-- Blacklist + Additional addresses side by side -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

        <!-- Blacklist -->
        <div>
          <button
            class="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2"
            @click="showBlacklist = !showBlacklist"
          >
            <span>{{ showBlacklist ? '▾' : '▸' }}</span>
            <span>Blacklist kontaktů{{ blacklist.length ? ` (${blacklist.length})` : '' }}</span>
          </button>
          <div v-if="showBlacklist" class="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div class="space-y-2 mb-4">
              <div
                v-for="email in blacklist"
                :key="email"
                class="flex items-center justify-between gap-2 text-sm"
              >
                <span class="font-mono text-gray-600 truncate">{{ email }}</span>
                <button
                  class="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  @click="removeFromBlacklist(email)"
                >odebrat</button>
              </div>
              <p v-if="!blacklist.length" class="text-xs text-gray-400 italic">Žádné blokované adresy</p>
            </div>
            <p v-if="blacklistError" class="text-[11px] text-red-500 mb-2">{{ blacklistError }}</p>
            <div class="flex items-center gap-2">
              <input
                v-model="newBlacklistEmail"
                type="email"
                placeholder="email@example.com"
                class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-0"
                @keydown.enter="addToBlacklist"
              />
              <button
                class="text-sm px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex-shrink-0"
                @click="addToBlacklist"
              >Přidat</button>
            </div>
          </div>
        </div>

        <!-- Additional addresses -->
        <div>
          <button
            class="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2"
            @click="showAdditionalAddresses = !showAdditionalAddresses"
          >
            <span>{{ showAdditionalAddresses ? '▾' : '▸' }}</span>
            <span>Přídavné adresy{{ additionalAddresses.length ? ` (${additionalAddresses.length})` : '' }}</span>
          </button>
          <div v-if="showAdditionalAddresses" class="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p class="text-[11px] text-gray-400 mb-3">Emaily sledované v rámci tohoto projektu, ale nezapsané do globálního profilu partnera.</p>
            <div class="space-y-2 mb-4">
              <div
                v-for="email in additionalAddresses"
                :key="email"
                class="flex items-center justify-between gap-2 text-sm"
              >
                <span class="font-mono text-gray-600 truncate">{{ email }}</span>
                <button
                  class="text-xs text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  @click="removeAdditionalAddress(email)"
                >odebrat</button>
              </div>
              <p v-if="!additionalAddresses.length" class="text-xs text-gray-400 italic">Žádné přídavné adresy</p>
            </div>
            <p v-if="additionalError" class="text-[11px] text-red-500 mb-2">{{ additionalError }}</p>
            <div class="flex items-center gap-2">
              <input
                v-model="newAdditionalEmail"
                type="email"
                placeholder="email@example.com"
                class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 flex-1 min-w-0"
                @keydown.enter="addAdditionalAddress"
              />
              <button
                class="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-shrink-0"
                @click="addAdditionalAddress"
              >Přidat</button>
            </div>
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

  <PartnersPartnerFormModal
    v-if="showEditModal && partner"
    mode="edit"
    :partner="{ id: partner.id, canonicalName: partner.canonicalName, payload: partner.payload }"
    @close="showEditModal = false"
    @saved="showEditModal = false; refreshPartner()"
  />
</template>

<style scoped>
.email-html-preview {
  overflow-x: auto;
  word-break: break-word;
}
.email-html-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
.email-html-preview :deep(a) {
  color: #4f46e5;
  text-decoration: underline;
}
.email-html-preview :deep(blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #6b7280;
}
.email-html-preview :deep(p) {
  margin: 0.25rem 0;
}
.email-html-preview :deep(table) {
  max-width: 100%;
  border-collapse: collapse;
}
.email-html-preview :deep(td),
.email-html-preview :deep(th) {
  vertical-align: top;
}
.email-html-preview :deep(h1),
.email-html-preview :deep(h2),
.email-html-preview :deep(h3) {
  margin: 0.5rem 0 0.25rem;
  font-weight: 600;
}
.email-html-preview :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.5rem 0;
}
</style>
