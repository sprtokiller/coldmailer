<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

// ── Credits ─────────────────────────────────────────────────────────────────
const { data: credits, pending: creditsPending, error: creditsError, refresh: refreshCredits } = await useFetch('/api/settings/credits')

const usedPct = computed(() => {
  if (!credits.value || credits.value.totalCredits <= 0) return 0
  return Math.min(100, (credits.value.usedCredits / credits.value.totalCredits) * 100)
})
const remainingPct = computed(() => 100 - usedPct.value)
const barColor = computed(() => {
  if (remainingPct.value > 40) return 'bg-success'
  if (remainingPct.value > 15) return 'bg-amber-400'
  return 'bg-danger'
})
const textColor = computed(() => {
  if (remainingPct.value > 40) return 'text-success'
  if (remainingPct.value > 15) return 'text-amber-500'
  return 'text-danger'
})
function fmt(n: number) { return n.toFixed(4) }

// ── Current user profile ─────────────────────────────────────────────────────
type Role = { id: string; name: string; description: string | null; color: string; permissions: string[]; isSystem: boolean }
type PermOverride = { id: string; key: string; granted: boolean }
type Budget = { limitUsd: number | null; usedUsd: number }
type MeResponse = {
  user: { id: string; email: string; name: string; image: string | null; isSuperAdmin: boolean; createdAt: string }
  roles: Role[]
  permOverrides: PermOverride[]
  budget: Budget | null
  effectivePermissions: string[]
}

const { data: me, refresh: refreshMe } = await useFetch<MeResponse>('/api/settings/me')

const isSuperAdmin = computed(() => me.value?.user.isSuperAdmin ?? false)
const canManageRoles = computed(() => me.value?.effectivePermissions.includes('admin.roles') || isSuperAdmin.value)

// Permission groups for display
const PERMISSION_GROUPS = [
  { label: 'Systémové prompty', keys: ['prompts.system.read', 'prompts.system.edit'] },
  { label: 'Vlastní prompty', keys: ['prompts.own.read', 'prompts.own.edit'] },
  { label: 'Cizí prompty', keys: ['prompts.others.read', 'prompts.others.edit'] },
  { label: 'Kontextové části', keys: ['context.own.read', 'context.own.edit', 'context.others.read', 'context.others.edit'] },
  { label: 'Prodejní argumenty', keys: ['selling.own.read', 'selling.own.edit', 'selling.others.read', 'selling.others.edit'] },
  { label: 'Mailové šablony', keys: ['drafts.own.read', 'drafts.own.edit', 'drafts.others.read', 'drafts.others.edit'] },
  { label: 'Podpisy', keys: ['signatures.own.edit', 'signatures.system.edit'] },
  { label: 'Pipeline', keys: ['pipeline.serpapi', 'pipeline.deep_research', 'pipeline.claude', 'pipeline.gmail'] },
  { label: 'Správa', keys: ['admin.roles'] },
]

const PERMISSION_LABELS: Record<string, string> = {
  'prompts.system.read': 'Číst systémové prompty',
  'prompts.system.edit': 'Upravovat systémové prompty',
  'prompts.own.read': 'Číst vlastní prompty',
  'prompts.own.edit': 'Vytvářet / editovat vlastní prompty',
  'prompts.others.read': 'Číst cizí prompty',
  'prompts.others.edit': 'Upravovat cizí prompty',
  'context.own.read': 'Číst vlastní kontextové části',
  'context.own.edit': 'Vytvářet / editovat vlastní kontextové části',
  'context.others.read': 'Číst cizí kontextové části',
  'context.others.edit': 'Upravovat cizí kontextové části',
  'selling.own.read': 'Číst vlastní prodejní argumenty',
  'selling.own.edit': 'Vytvářet / editovat vlastní prodejní argumenty',
  'selling.others.read': 'Číst cizí prodejní argumenty',
  'selling.others.edit': 'Upravovat cizí prodejní argumenty',
  'drafts.own.read': 'Číst vlastní e-mailové šablony',
  'drafts.own.edit': 'Vytvářet / editovat vlastní e-mailové šablony',
  'drafts.others.read': 'Číst cizí e-mailové šablony',
  'drafts.others.edit': 'Upravovat cizí e-mailové šablony',
  'pipeline.serpapi': 'Spouštět Partner Identification (SerpAPI)',
  'pipeline.deep_research': 'Spouštět deep-research kroky (o4-mini)',
  'pipeline.claude': 'Spouštět Claude kroky',
  'pipeline.gmail': 'Vytvářet Gmail drafty',
  'admin.roles': 'Správa rolí a oprávnění uživatelů',
}

// ── Admin: Users ─────────────────────────────────────────────────────────────
type AdminUser = {
  id: string; email: string; name: string; image: string | null
  isSuperAdmin: boolean; createdAt: string
  roles: Role[]; permOverrides: PermOverride[]
  budget: Budget | null; effectivePermissions: string[]
}

const { data: adminUsers, refresh: refreshUsers } = canManageRoles.value
  ? await useFetch<AdminUser[]>('/api/admin/users')
  : { data: ref<AdminUser[] | null>(null), refresh: async () => {} }

const { data: adminRoles, refresh: refreshRoles } = canManageRoles.value
  ? await useFetch<Role[]>('/api/admin/roles')
  : { data: ref<Role[] | null>(null), refresh: async () => {} }

// ── Selected user panel ───────────────────────────────────────────────────────
const selectedUserId = ref<string | null>(null)
const selectedUser = computed(() => adminUsers.value?.find(u => u.id === selectedUserId.value) ?? null)

function selectUser(userId: string) {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

// ── Assign / remove role ─────────────────────────────────────────────────────
async function assignRole(userId: string, roleId: string) {
  await $fetch(`/api/admin/users/${userId}/roles`, { method: 'POST', body: { roleId } })
  await refreshUsers()
}
async function removeRole(userId: string, roleId: string) {
  await $fetch(`/api/admin/users/${userId}/roles/${roleId}`, { method: 'DELETE' })
  await refreshUsers()
}

// ── Permission overrides ──────────────────────────────────────────────────────
const overrideState = ref<Record<string, boolean | null>>({})

function initOverrides(user: AdminUser) {
  const map: Record<string, boolean | null> = {}
  for (const ov of user.permOverrides) map[ov.key] = ov.granted
  overrideState.value = map
}

watch(selectedUser, (u) => { if (u) initOverrides(u) })

async function saveOverrides(userId: string) {
  const overrides = Object.entries(overrideState.value).map(([key, granted]) => ({ key, granted }))
  await $fetch(`/api/admin/users/${userId}/permissions`, { method: 'PATCH', body: { overrides } })
  await refreshUsers()
}

// ── Budget ────────────────────────────────────────────────────────────────────
const budgetInput = ref<string>('')
watch(selectedUser, (u) => {
  budgetInput.value = u?.budget?.limitUsd != null ? String(u.budget.limitUsd) : ''
})
async function saveBudget(userId: string) {
  const limitUsd = budgetInput.value.trim() === '' ? null : parseFloat(budgetInput.value)
  await $fetch(`/api/admin/users/${userId}/budget`, { method: 'PATCH', body: { limitUsd } })
  await refreshUsers()
}

// ── Superadmin toggle ─────────────────────────────────────────────────────────
async function toggleSuperAdmin(user: AdminUser) {
  if (!confirm(`${user.isSuperAdmin ? 'Odebrat' : 'Přidělit'} superadmin status uživateli ${user.name}?`)) return
  await $fetch(`/api/admin/users/${user.id}/superadmin`, { method: 'PATCH', body: { isSuperAdmin: !user.isSuperAdmin } })
  await refreshUsers()
}

// ── Role modal ────────────────────────────────────────────────────────────────
const showRoleModal = ref(false)
const editingRole = ref<Role | null>(null)
const roleForm = ref({ name: '', description: '', color: '#6366f1', permissions: [] as string[] })
const roleSaving = ref(false)

const ROLE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b']
const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS)

function openCreateRole() {
  editingRole.value = null
  roleForm.value = { name: '', description: '', color: '#6366f1', permissions: [] }
  showRoleModal.value = true
}

function openEditRole(role: Role) {
  editingRole.value = role
  roleForm.value = { name: role.name, description: role.description ?? '', color: role.color, permissions: [...role.permissions] }
  showRoleModal.value = true
}

function toggleRolePerm(key: string) {
  const idx = roleForm.value.permissions.indexOf(key)
  if (idx >= 0) roleForm.value.permissions.splice(idx, 1)
  else roleForm.value.permissions.push(key)
}

async function saveRole() {
  roleSaving.value = true
  try {
    if (editingRole.value) {
      await $fetch(`/api/admin/roles/${editingRole.value.id}`, { method: 'PATCH', body: roleForm.value })
    } else {
      await $fetch('/api/admin/roles', { method: 'POST', body: roleForm.value })
    }
    await refreshRoles()
    showRoleModal.value = false
  } finally {
    roleSaving.value = false
  }
}

async function deleteRole(role: Role) {
  if (!confirm(`Opravdu smazat roli "${role.name}"?`)) return
  await $fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
  await refreshRoles()
}

const superadminCount = computed(() => adminUsers.value?.filter(u => u.isSuperAdmin).length ?? 0)

// ── Admin tab ─────────────────────────────────────────────────────────────────
const adminTab = ref<'users' | 'roles'>('users')
</script>

<template>
  <div>
    <div class="flex items-start justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Nastavení</h1>
        <p class="text-sm text-gray-400 mt-1">Přehled účtu a konfigurace integrace.</p>
      </div>

      <!-- Credits widget -->
      <div class="w-72 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 shrink-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">OpenRouter kredity</span>
          <button
            class="text-gray-300 hover:text-gray-500 transition-colors"
            :class="{ 'animate-spin': creditsPending }"
            title="Obnovit"
            @click="refreshCredits()"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div v-if="creditsPending" class="py-6 flex items-center justify-center text-gray-300">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <div v-else-if="creditsError" class="py-4 text-center">
          <p class="text-xs text-danger">{{ creditsError.message }}</p>
          <p class="text-xs text-gray-400 mt-1">Zkontrolujte <code class="bg-gray-50 px-1 rounded">OPEN_ROUTER_MANAGEMENT_KEY</code></p>
        </div>

        <template v-else-if="credits">
          <div class="mt-3 mb-4">
            <span class="text-3xl font-bold" :class="textColor">${{ fmt(credits.remainingCredits) }}</span>
            <span class="text-sm text-gray-400 ml-1">zbývá</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <div class="h-2 rounded-full transition-all duration-700" :class="barColor" :style="`width: ${remainingPct}%`" />
          </div>
          <div class="flex justify-between text-xs text-gray-400">
            <span>Celkem ${{ fmt(credits.totalCredits) }}</span>
            <span>Využito ${{ fmt(credits.usedCredits) }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- ── Moje oprávnění ───────────────────────────────────────────────── -->
    <div v-if="me" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
      <h2 class="text-base font-semibold text-gray-800 mb-1">Moje oprávnění</h2>
      <p class="text-sm text-gray-400 mb-4">Přehled vašich platných oprávnění (kombinace rolí a individuálních nastavení).</p>

      <!-- Roles & budget summary -->
      <div class="flex flex-wrap items-center gap-2 mb-5">
        <span v-if="me.user.isSuperAdmin" class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          Superadmin
        </span>
        <span
          v-for="role in me.roles"
          :key="role.id"
          class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border"
          :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
        >
          <span class="w-1.5 h-1.5 rounded-full" :style="`background: ${role.color}`"></span>
          {{ role.name }}
        </span>
        <span v-if="me.roles.length === 0 && !me.user.isSuperAdmin" class="text-xs text-gray-400">Žádná přiřazená role (výchozí oprávnění)</span>
        <span v-if="me.budget" class="ml-auto text-xs text-gray-500">
          Budget: ${{ me.budget.usedUsd.toFixed(2) }} / {{ me.budget.limitUsd != null ? `$${me.budget.limitUsd.toFixed(2)}` : 'neomezeno' }}
        </span>
      </div>

      <!-- Permission table -->
      <div class="overflow-hidden rounded-xl border border-gray-100">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-40">Skupina</th>
              <th class="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Oprávnění</th>
              <th class="text-center px-4 py-2.5 text-xs font-medium text-gray-500 w-16">Stav</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(group, gi) in PERMISSION_GROUPS" :key="gi">
              <tr
                v-for="(key, ki) in group.keys"
                :key="key"
                class="border-b border-gray-50 last:border-0"
              >
                <td class="px-4 py-2 text-xs text-gray-500 align-top" :class="ki > 0 ? 'text-transparent select-none' : ''">
                  {{ ki === 0 ? group.label : '' }}
                </td>
                <td class="px-4 py-2 text-xs text-gray-700">{{ PERMISSION_LABELS[key] }}</td>
                <td class="px-4 py-2 text-center">
                  <span v-if="me.effectivePermissions.includes(key)" class="text-emerald-500" title="Povoleno">
                    <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span v-else class="text-gray-300" title="Zakázáno">
                    <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Admin sekce ─────────────────────────────────────────────────────── -->
    <template v-if="canManageRoles">
      <!-- Tab switcher -->
      <div class="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          :class="adminTab === 'users' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          @click="adminTab = 'users'"
        >Správa uživatelů</button>
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
          :class="adminTab === 'roles' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
          @click="adminTab = 'roles'"
        >Správa rolí</button>
      </div>

      <!-- ── Správa uživatelů ───────────────────────────────────────── -->
      <div v-if="adminTab === 'users'" class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-gray-100">
          <h2 class="text-base font-semibold text-gray-800">Správa uživatelů</h2>
        </div>

        <div v-if="!adminUsers || adminUsers.length === 0" class="py-12 text-center text-gray-400 text-sm">
          Žádní uživatelé.
        </div>

        <template v-else>
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Jméno / E-mail</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Role</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Budget</th>
                <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 w-10"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="u in adminUsers" :key="u.id">
                <tr
                  class="border-b border-gray-50 cursor-pointer hover:bg-gray-50/70 transition-colors"
                  :class="selectedUserId === u.id ? 'bg-primary/5' : ''"
                  @click="selectUser(u.id)"
                >
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-2.5">
                      <img v-if="u.image" :src="u.image" :alt="u.name" class="w-7 h-7 rounded-full shrink-0" referrerpolicy="no-referrer" />
                      <div v-else class="w-7 h-7 rounded-full bg-gray-200 shrink-0 flex items-center justify-center text-xs font-medium text-gray-500">{{ u.name.charAt(0) }}</div>
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="font-medium text-gray-800">{{ u.name }}</span>
                          <span v-if="u.isSuperAdmin" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">SA</span>
                          <span v-if="u.id === me?.user.id" class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Já</span>
                        </div>
                        <div class="text-xs text-gray-400">{{ u.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-5 py-3">
                    <div class="flex flex-wrap gap-1">
                      <span v-if="u.isSuperAdmin" class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Superadmin</span>
                      <span
                        v-for="role in u.roles"
                        :key="role.id"
                        class="text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                        :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
                      >{{ role.name }}</span>
                      <span v-if="!u.isSuperAdmin && u.roles.length === 0" class="text-xs text-gray-400">—</span>
                    </div>
                  </td>
                  <td class="px-5 py-3 text-xs text-gray-500">
                    <span v-if="u.budget">
                      ${{ u.budget.usedUsd.toFixed(2) }} / {{ u.budget.limitUsd != null ? `$${u.budget.limitUsd.toFixed(2)}` : '' }}
                    </span>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                  <td class="px-5 py-3 text-right">
                    <svg class="w-4 h-4 text-gray-400 transition-transform" :class="selectedUserId === u.id ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                </tr>

                <!-- Expanded user panel -->
                <tr v-if="selectedUserId === u.id" class="bg-gray-50/60">
                  <td colspan="4" class="px-5 py-5">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

                      <!-- Roles -->
                      <div>
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Přiřazené role</div>
                        <div class="flex flex-wrap gap-1.5 mb-3">
                          <span
                            v-for="role in u.roles"
                            :key="role.id"
                            class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80"
                            :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
                            @click.stop="removeRole(u.id, role.id)"
                            title="Kliknutím odeberete roli"
                          >
                            {{ role.name }}
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                          </span>
                        </div>
                        <div class="text-xs font-medium text-gray-500 mb-1">Přidat roli:</div>
                        <div class="flex flex-wrap gap-1">
                          <button
                            v-for="role in adminRoles?.filter(r => !u.roles.some(ur => ur.id === r.id))"
                            :key="role.id"
                            class="text-xs px-2 py-0.5 rounded-full border hover:opacity-80 transition-opacity"
                            :style="`background-color: ${role.color}10; border-color: ${role.color}33; color: ${role.color}`"
                            @click.stop="assignRole(u.id, role.id)"
                          >+ {{ role.name }}</button>
                        </div>

                        <!-- Superadmin toggle -->
                        <div v-if="isSuperAdmin" class="mt-4">
                          <button
                            class="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            :class="u.isSuperAdmin ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            :disabled="u.isSuperAdmin && superadminCount <= 1"
                            :title="u.isSuperAdmin && superadminCount <= 1 ? 'Nejprve přidělte superadmin status jinému uživateli' : undefined"
                            @click.stop="toggleSuperAdmin(u)"
                          >
                            {{ u.isSuperAdmin ? 'Odebrat Superadmin' : 'Nastavit jako Superadmin' }}
                          </button>
                          <p v-if="u.isSuperAdmin && superadminCount <= 1" class="text-[10px] text-amber-600 mt-1">
                            Nelze odebrat — jediný superadmin v systému.
                          </p>
                        </div>
                      </div>

                      <!-- Permission overrides -->
                      <div>
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Individuální oprávnění</div>
                        <div class="space-y-0.5 max-h-60 overflow-y-auto pr-1">
                          <div v-for="group in PERMISSION_GROUPS" :key="group.label">
                            <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-0.5">{{ group.label }}</div>
                            <label
                              v-for="key in group.keys"
                              :key="key"
                              class="flex items-center gap-2 py-0.5 cursor-pointer"
                            >
                              <select
                                :value="overrideState[key] === undefined ? '' : overrideState[key] === true ? 'grant' : 'deny'"
                                class="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                @change="(e) => {
                                  const val = (e.target as HTMLSelectElement).value
                                  if (val === '') delete overrideState[key]
                                  else overrideState[key] = val === 'grant'
                                }"
                              >
                                <option value="">— (z role)</option>
                                <option value="grant">Povolit</option>
                                <option value="deny">Zakázat</option>
                              </select>
                              <span class="text-xs text-gray-600">{{ PERMISSION_LABELS[key] }}</span>
                            </label>
                          </div>
                        </div>
                        <button
                          class="mt-3 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          @click.stop="saveOverrides(u.id)"
                        >Uložit oprávnění</button>
                      </div>

                      <!-- Budget -->
                      <div>
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Budget</div>
                        <div class="text-xs text-gray-500 mb-2">
                          Využito: ${{ u.budget?.usedUsd.toFixed(2) ?? '0.00' }}
                        </div>
                        <div class="flex gap-2 items-center">
                          <input
                            v-model="budgetInput"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="neomezeno"
                            class="w-32 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <span class="text-xs text-gray-400">USD</span>
                        </div>
                        <button
                          class="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          @click.stop="saveBudget(u.id)"
                        >Nastavit limit</button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>
      </div>

      <!-- ── Správa rolí ────────────────────────────────────────────── -->
      <div v-if="adminTab === 'roles'" class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-800">Správa rolí</h2>
          <button
            class="bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            @click="openCreateRole"
          >+ Nová role</button>
        </div>

        <div v-if="!adminRoles || adminRoles.length === 0" class="py-12 text-center text-gray-400 text-sm">
          Žádné role.
        </div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Role</th>
              <th class="text-left px-5 py-3 text-xs font-medium text-gray-500">Popis</th>
              <th class="text-center px-5 py-3 text-xs font-medium text-gray-500">Oprávnění</th>
              <th class="px-5 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in adminRoles" :key="role.id" class="border-b border-gray-50">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full shrink-0" :style="`background: ${role.color}`"></span>
                  <span class="font-medium text-gray-800">{{ role.name }}</span>
                  <span v-if="role.isSystem" class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">systém</span>
                </div>
              </td>
              <td class="px-5 py-3 text-xs text-gray-500">{{ role.description ?? '—' }}</td>
              <td class="px-5 py-3 text-center text-xs text-gray-600">{{ role.permissions.length }} / {{ ALL_PERMISSION_KEYS.length }}</td>
              <td class="px-5 py-3">
                <div class="flex items-center gap-2 justify-end">
                  <button
                    class="text-xs text-primary border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                    @click="openEditRole(role)"
                  >Upravit</button>
                  <button
                    class="text-xs text-danger border border-danger/20 px-2.5 py-1 rounded-lg hover:bg-danger/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="role.isSystem"
                    :title="role.isSystem ? 'Systémové role nelze smazat' : 'Smazat'"
                    @click="deleteRole(role)"
                  >Smazat</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── Role modal ─────────────────────────────────────────────────────── -->
    <div v-if="showRoleModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">{{ editingRole ? 'Upravit roli' : 'Nová role' }}</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="showRoleModal = false">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Název</label>
            <input v-model="roleForm.name" type="text" required class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Popis (volitelně)</label>
            <input v-model="roleForm.description" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-2">Barva</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="c in ROLE_COLORS"
                :key="c"
                type="button"
                class="w-7 h-7 rounded-full border-2 transition-all"
                :style="`background: ${c}; border-color: ${roleForm.color === c ? c : 'transparent'}`"
                :class="roleForm.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''"
                @click="roleForm.color = c"
              ></button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-2">Oprávnění</label>
            <div class="space-y-0.5">
              <div v-for="group in PERMISSION_GROUPS" :key="group.label">
                <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-1">{{ group.label }}</div>
                <label
                  v-for="key in group.keys"
                  :key="key"
                  class="flex items-center gap-2 py-0.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="roleForm.permissions.includes(key)"
                    class="accent-primary"
                    @change="toggleRolePerm(key)"
                  />
                  <span class="text-xs text-gray-700">{{ PERMISSION_LABELS[key] }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            :disabled="roleSaving || !roleForm.name.trim()"
            class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="saveRole"
          >{{ roleSaving ? 'Ukládám…' : 'Uložit' }}</button>
          <button class="text-sm text-gray-400 hover:text-gray-600 px-3" @click="showRoleModal = false">Zrušit</button>
        </div>
      </div>
    </div>
  </div>
</template>
