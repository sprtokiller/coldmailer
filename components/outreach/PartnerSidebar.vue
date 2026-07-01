<script setup lang="ts">
import { projectOutreachKey } from '~/composables/useProjectOutreach'

const ctx = inject(projectOutreachKey)!

const { user: sessionUser } = useUserSession()
const isAdmin = computed(() => !!(sessionUser.value as any)?.isAdmin)
const myId = computed(() => (sessionUser.value as any)?.id as string | undefined)
const showAssignModal = ref(false)

const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  const all = ctx.partners.value.filter(p => !q || p.canonicalName.toLowerCase().includes(q))

  if (ctx.canManageAll.value) {
    return [...all].sort((a, b) => {
      const aScore = !a.assignment ? 1 : a.assignment.assigneeId === myId.value ? 0 : 2
      const bScore = !b.assignment ? 1 : b.assignment.assigneeId === myId.value ? 0 : 2
      return aScore - bScore || a.canonicalName.localeCompare(b.canonicalName)
    })
  }

  // Obchodní tým: vidí jen partnery přiřazené mně nebo nepřiřazené
  return [...all]
    .filter(p => !p.assignment || p.assignment.assigneeId === myId.value)
    .sort((a, b) => {
      const aScore = a.assignment ? 0 : 1
      const bScore = b.assignment ? 0 : 1
      return aScore - bScore || a.canonicalName.localeCompare(b.canonicalName)
    })
})

function getStatus(p: typeof filtered.value[0]): 'sent' | 'saved' | 'aligned' | null {
  if (p.draft?.sentAt) return 'sent'
  if (p.draft?.savedAt) return 'saved'
  if (p.alignment) return 'aligned'
  return null
}

const STATUS_META = {
  sent:    { label: 'Odesláno',    icon: '✓', cls: 'status--sent' },
  saved:   { label: 'Uloženo',     icon: '◉', cls: 'status--saved' },
  aligned: { label: 'Analyzováno', icon: '◈', cls: 'status--aligned' },
}
</script>

<template>
  <div class="sidebar-wrap">
    <!-- Search -->
    <div class="sidebar-search flex items-center gap-2">
      <div class="relative flex-1">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Hledat partnera…"
          class="search-input w-full"
        />
      </div>
      <ClientOnly>
        <button v-if="isAdmin" class="text-white bg-primary p-1.5 rounded hover:opacity-90 transition-opacity flex-shrink-0" title="Přidat partnera do projektu" @click="showAssignModal = true">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </ClientOnly>
    </div>

    <!-- Loading -->
    <div v-if="ctx.loadingPartners.value" class="state-center">
      <svg class="spinner" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Načítám…</span>
    </div>

    <!-- Empty -->
    <div v-else-if="filtered.length === 0" class="state-center state-empty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:32px;height:32px;color:#d1d5db;margin-bottom:8px">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a4 4 0 00-5.197-3.795M9 20H4v-2a4 4 0 015.197-3.795M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span v-if="ctx.partners.value.length === 0">Žádní partneři<br/>v projektu</span>
      <span v-else>Žádná shoda</span>
    </div>

    <!-- List -->
    <div v-else class="partner-list">
      <button
        v-for="p in filtered"
        :key="p.id"
        class="partner-item"
        :class="{ 'partner-item--active': ctx.selectedPartnerId.value === p.id }"
        @click="ctx.selectPartner(p.id)"
      >
        <!-- Avatar / initials -->
        <div class="partner-avatar" :class="{ 'partner-avatar--active': ctx.selectedPartnerId.value === p.id }">
          {{ p.canonicalName.charAt(0).toUpperCase() }}
        </div>

        <!-- Name + status + assignment -->
        <div class="partner-info">
          <span class="partner-name" :title="p.canonicalName">{{ p.canonicalName }}</span>
          <div class="partner-meta">
            <span
              v-if="getStatus(p)"
              class="partner-status"
              :class="STATUS_META[getStatus(p)!].cls"
            >
              {{ STATUS_META[getStatus(p)!].icon }} {{ STATUS_META[getStatus(p)!].label }}
            </span>
            <span v-if="p.assignment" class="assignment-tag assignment-tag--assigned" :title="p.assignment.assignee.name">
              {{ p.assignment.assigneeId === myId ? 'Moje' : p.assignment.assignee.name.split(' ')[0] }}
            </span>
            <span v-else class="assignment-tag assignment-tag--free">Volno</span>
          </div>
        </div>
      </button>
    </div>

    <!-- Modals -->
    <PartnersPartnerSearchAssign v-if="showAssignModal" @close="showAssignModal = false" @assigned="showAssignModal = false; ctx.refreshPartners()" />
  </div>
</template>

<style scoped>
.sidebar-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Search ──────────────────────────────────────────────── */
.sidebar-search {
  position: relative;
  padding: 10px 12px;
  border-bottom: 1px solid #e9eaec;
  flex-shrink: 0;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 7px 10px 7px 32px;
  font-size: 13px;
  color: #1f2937;
  background: #f9fafb;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  border-color: #a78bfa;
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.15);
  background: #fff;
}

.search-input::placeholder {
  color: #9ca3af;
}

/* ── States ──────────────────────────────────────────────── */
.state-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  padding: 24px;
}

.spinner {
  width: 20px;
  height: 20px;
  animation: spin 0.8s linear infinite;
  color: #a78bfa;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Partner list ────────────────────────────────────────── */
.partner-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}

.partner-list::-webkit-scrollbar { width: 4px; }
.partner-list::-webkit-scrollbar-track { background: transparent; }
.partner-list::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }

.partner-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
  margin-bottom: 2px;
}

.partner-item:hover {
  background: #f5f3ff;
}

.partner-item--active {
  background: #f0ebff;
}

/* ── Avatar ──────────────────────────────────────────────── */
.partner-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #e9eaec;
  color: #6b7280;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}

.partner-avatar--active {
  background: #7c3aed;
  color: #fff;
}

/* ── Info ────────────────────────────────────────────────── */
.partner-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.partner-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.partner-name {
  font-size: 13px;
  font-weight: 500;
  color: #1a1d23;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.partner-item--active .partner-name {
  color: #6d28d9;
  font-weight: 600;
}

/* ── Status badges ───────────────────────────────────────── */
.partner-status {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.status--sent    { color: #2563eb; }
.status--saved   { color: #059669; }
.status--aligned { color: #7c3aed; }

/* ── Assignment tags ─────────────────────────────────────── */
.assignment-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.4;
  flex-shrink: 0;
}

.assignment-tag--assigned {
  background: #ede9fe;
  color: #6d28d9;
}

.assignment-tag--free {
  background: #f0fdf4;
  color: #15803d;
}
</style>
