<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const { refreshGroups } = useActiveGroup()

// ── Credits ──────────────────────────────────────────────────────────────────
const { data: credits, pending: creditsPending, error: creditsError, refresh: refreshCredits } = await useFetch('/api/settings/credits')

const usedPct = computed(() => {
  if (!credits.value || credits.value.totalCredits <= 0) return 0
  return Math.min(100, (credits.value.usedCredits / credits.value.totalCredits) * 100)
})
const remainingPct = computed(() => 100 - usedPct.value)
const barColor = computed(() => {
  if (remainingPct.value > 40) return 'bg-emerald-400'
  if (remainingPct.value > 15) return 'bg-amber-400'
  return 'bg-red-400'
})
const textColor = computed(() => {
  if (remainingPct.value > 40) return 'text-emerald-500'
  if (remainingPct.value > 15) return 'text-amber-500'
  return 'text-red-500'
})
function fmt(n: number) { return n.toFixed(4) }

// ── Current user profile ──────────────────────────────────────────────────────
type Role = { id: string; name: string; description: string | null; color: string; permissions: string[]; isSystem: boolean }
type PermOverride = { id: string; key: string; granted: boolean }
type BudgetResetPeriod = 'never' | 'daily' | 'weekly' | 'monthly'
type Budget = { limitUsd: number | null; usedUsd: number; resetPeriod: BudgetResetPeriod; periodStartAt: string | null }
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

// ── Permission groups / labels ────────────────────────────────────────────────
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
  'signatures.own.edit': 'Vytvářet / editovat vlastní podpisy',
  'signatures.system.edit': 'Spravovat podpisové šablony (systémové)',
  'pipeline.serpapi': 'Spouštět Partner Identification (SerpAPI)',
  'pipeline.deep_research': 'Spouštět deep-research kroky (o4-mini)',
  'pipeline.claude': 'Spouštět Claude kroky',
  'pipeline.gmail': 'Vytvářet Gmail drafty',
  'admin.roles': 'Správa rolí a oprávnění uživatelů',
}

// ── Admin: Users ──────────────────────────────────────────────────────────────
type GroupInfo = { id: string; name: string; slug: string; color: string }
type AdminUser = {
  id: string; email: string; name: string; image: string | null
  isSuperAdmin: boolean; createdAt: string
  roles: Role[]; groups: GroupInfo[]; permOverrides: PermOverride[]
  budget: Budget | null; effectivePermissions: string[]
}

const { data: adminUsers, refresh: refreshUsers } = canManageRoles.value
  ? await useFetch<AdminUser[]>('/api/admin/users')
  : { data: ref<AdminUser[] | null>(null), refresh: async () => {} }

const { data: adminRoles, refresh: refreshRoles } = canManageRoles.value
  ? await useFetch<Role[]>('/api/admin/roles')
  : { data: ref<Role[] | null>(null), refresh: async () => {} }

const { data: adminGroups, refresh: refreshAdminGroups } = canManageRoles.value
  ? await useFetch<GroupInfo[]>('/api/admin/groups')
  : { data: ref<GroupInfo[] | null>(null), refresh: async () => {} }

// ── Selected user panel ───────────────────────────────────────────────────────
const selectedUserId = ref<string | null>(null)
const selectedUser = computed(() => adminUsers.value?.find(u => u.id === selectedUserId.value) ?? null)

function selectUser(userId: string) {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

// ── Assign / remove role ──────────────────────────────────────────────────────
async function assignRole(userId: string, roleId: string) {
  await $fetch(`/api/admin/users/${userId}/roles`, { method: 'POST', body: { roleId } })
  await refreshUsers()
}
async function removeRole(userId: string, roleId: string) {
  await $fetch(`/api/admin/users/${userId}/roles/${roleId}`, { method: 'DELETE' })
  await refreshUsers()
}

// ── Assign / remove group ────────────────────────────────────────────────────
async function assignGroup(userId: string, groupId: string) {
  await $fetch(`/api/admin/users/${userId}/groups`, { method: 'POST', body: { groupId } })
  await Promise.all([refreshUsers(), refreshGroups()])
}
async function removeGroup(userId: string, groupId: string) {
  await $fetch(`/api/admin/users/${userId}/groups/${groupId}`, { method: 'DELETE' })
  await Promise.all([refreshUsers(), refreshGroups()])
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

// ── Budget ─────────────────────────────────────────────────────────────────────
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

// ── Role modal ─────────────────────────────────────────────────────────────────
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

// ── Budget management (Správa limitů) ────────────────────────────────────────
type BudgetUser = {
  id: string; name: string; email: string; image: string | null
  isSuperAdmin: boolean; createdAt: string
  budget: Budget | null
  stats30d: { aiCost: number; aiCount: number; serpCount: number }
}
type DefaultBudgetCfg = { limitUsd: number | null; resetPeriod: BudgetResetPeriod }
type BudgetResponse = { users: BudgetUser[]; defaultBudget: DefaultBudgetCfg }

const { data: budgetData, refresh: refreshBudget } = canManageRoles.value
  ? await useFetch<BudgetResponse>('/api/admin/budget')
  : { data: ref<BudgetResponse | null>(null), refresh: async () => {} }

const budgetUsers = computed(() => budgetData.value?.users ?? [])

// Default budget form
const defBudget = ref<DefaultBudgetCfg>({ limitUsd: null, resetPeriod: 'never' })
watch(() => budgetData.value?.defaultBudget, (v) => { if (v) defBudget.value = { ...v } }, { immediate: true })

const defLimitInput = ref('')
watch(() => defBudget.value.limitUsd, (v) => { defLimitInput.value = v != null ? String(v) : '' }, { immediate: true })

async function saveDefaultBudget() {
  const limitUsd = defLimitInput.value.trim() === '' ? null : parseFloat(defLimitInput.value)
  await $fetch('/api/admin/budget/defaults', {
    method: 'PATCH',
    body: { limitUsd, resetPeriod: defBudget.value.resetPeriod },
  })
  await refreshBudget()
}

// Per-user budget editing
const selectedBudgetUserId = ref<string | null>(null)
const selectedBudgetUser = computed(() => budgetUsers.value.find(u => u.id === selectedBudgetUserId.value) ?? null)

const editLimitInput = ref('')
const editResetPeriod = ref<BudgetResetPeriod>('never')

watch(selectedBudgetUser, (u) => {
  if (!u) return
  editLimitInput.value = u.budget?.limitUsd != null ? String(u.budget.limitUsd) : ''
  editResetPeriod.value = u.budget?.resetPeriod ?? 'never'
})

async function saveBudgetUser() {
  if (!selectedBudgetUserId.value) return
  const limitUsd = editLimitInput.value.trim() === '' ? null : parseFloat(editLimitInput.value)
  await $fetch(`/api/admin/budget/${selectedBudgetUserId.value}`, {
    method: 'PATCH',
    body: { limitUsd, resetPeriod: editResetPeriod.value },
  })
  await refreshBudget()
}

async function resetBudgetCounter(userId: string) {
  if (!confirm('Opravdu resetovat čítač spotřeby na nulu?')) return
  await $fetch(`/api/admin/budget/${userId}`, {
    method: 'PATCH',
    body: { resetUsedNow: true },
  })
  await refreshBudget()
}

function budgetPct(u: BudgetUser) {
  if (!u.budget?.limitUsd) return null
  return Math.min(100, (u.budget.usedUsd / u.budget.limitUsd) * 100)
}

const RESET_PERIOD_LABELS: Record<BudgetResetPeriod, string> = {
  never: 'Bez resetu',
  daily: 'Denně',
  weekly: 'Týdně',
  monthly: 'Měsíčně',
}

const MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'openai/o4-mini': 'o4-mini',
  'openai/gpt-4o': 'GPT-4o',
  'pipeline/partner-identification': 'Partner Identification',
  'serpapi': 'SerpAPI',
}
function modelLabel(m: string) { return MODEL_LABELS[m] ?? m }

// ── Sidebar navigation ────────────────────────────────────────────────────────
type NavSection = 'permissions' | 'users' | 'roles' | 'budget' | 'system'

interface NavItem {
  id: NavSection
  label: string
  icon: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'permissions', label: 'Moje oprávnění', icon: 'shield' },
  { id: 'users',       label: 'Správa uživatelů', icon: 'users',  adminOnly: true },
  { id: 'roles',       label: 'Správa rolí',      icon: 'tag',    adminOnly: true },
  { id: 'budget',      label: 'Správa limitů',    icon: 'chart',  adminOnly: true },
  { id: 'system',      label: 'Systémová nastavení', icon: 'cog' },
]

const VALID_SECTIONS: NavSection[] = ['permissions', 'users', 'roles', 'budget', 'system']
const initialSection = VALID_SECTIONS.includes(route.query.tab as NavSection) ? (route.query.tab as NavSection) : 'permissions'
const activeSection = ref<NavSection>(initialSection)

watch(activeSection, (newSection) => {
  router.replace({ query: { ...route.query, tab: newSection } })
})

const visibleNav = computed(() =>
  NAV_ITEMS.filter(item => !item.adminOnly || canManageRoles.value),
)

// ── Industry tags ────────────────────────────────────────────────────────────
const industryTags = ref<string[]>([])
const industryTagsLoading = ref(false)
const newTag = ref('')

async function fetchTags() {
  industryTagsLoading.value = true
  try {
    const data = await $fetch<{ tags: string[] }>('/api/admin/tags')
    industryTags.value = data.tags
  } finally {
    industryTagsLoading.value = false
  }
}

async function saveTags(tags: string[]) {
  const data = await $fetch<{ tags: string[] }>('/api/admin/tags', { method: 'PUT', body: { tags } })
  industryTags.value = data.tags
}

function addTag() {
  const tag = newTag.value.trim()
  if (!tag || industryTags.value.includes(tag)) return
  saveTags([...industryTags.value, tag])
  newTag.value = ''
}

function removeTag(tag: string) {
  saveTags(industryTags.value.filter(t => t !== tag))
}

watch(activeSection, (s) => { if (s === 'system' && industryTags.value.length === 0) fetchTags() })
onMounted(() => { if (activeSection.value === 'system') fetchTags() })
</script>

<template>
  <div class="min-h-screen flex flex-col">

    <!-- ── Page header ────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-gray-800">Nastavení</h1>
        <p class="text-sm text-gray-400 mt-0.5">Přehled účtu a konfigurace integrace.</p>
      </div>

      <!-- Credits widget -->
      <div class="w-68 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 shrink-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">OpenRouter kredity</span>
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

        <div v-if="creditsPending" class="py-4 flex items-center justify-center text-gray-300">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <div v-else-if="creditsError" class="py-2 text-center">
          <p class="text-xs text-red-500">{{ creditsError.message }}</p>
          <p class="text-xs text-gray-400 mt-1">Zkontrolujte <code class="bg-gray-50 px-1 rounded">OPEN_ROUTER_MANAGEMENT_KEY</code></p>
        </div>

        <template v-else-if="credits">
          <div class="mt-2 mb-3">
            <span class="text-2xl font-bold" :class="textColor">${{ fmt(credits.remainingCredits) }}</span>
            <span class="text-xs text-gray-400 ml-1">zbývá</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 mb-2 overflow-hidden">
            <div class="h-1.5 rounded-full transition-all duration-700" :class="barColor" :style="`width: ${remainingPct}%`" />
          </div>
          <div class="flex justify-between text-[11px] text-gray-400">
            <span>Celkem ${{ fmt(credits.totalCredits) }}</span>
            <span>Využito ${{ fmt(credits.usedCredits) }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- ── Two-column layout ──────────────────────────────────────────────── -->
    <div class="flex gap-6 flex-1 min-h-0">

      <!-- ══ SIDEBAR ══════════════════════════════════════════════════════ -->
      <aside class="w-56 shrink-0">
        <nav class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-6">

          <!-- User identity pill -->
          <div v-if="me" class="px-4 py-4 border-b border-gray-100">
            <div class="flex items-center gap-2.5">
              <img
                v-if="me.user.image"
                :src="me.user.image"
                :alt="me.user.name"
                class="w-8 h-8 rounded-full shrink-0"
                referrerpolicy="no-referrer"
              />
              <div v-else class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shrink-0 flex items-center justify-center text-xs font-bold text-white">
                {{ me.user.name.charAt(0).toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-800 truncate">{{ me.user.name }}</div>
                <div class="text-[11px] text-gray-400 truncate">{{ me.user.email }}</div>
              </div>
            </div>
          </div>

          <!-- Nav items -->
          <ul class="py-2">
            <li v-for="item in visibleNav" :key="item.id">
              <button
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-150 rounded-none"
                :class="activeSection === item.id
                  ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'"
                @click="activeSection = item.id"
              >
                <!-- shield icon -->
                <svg v-if="item.icon === 'shield'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <!-- users icon -->
                <svg v-if="item.icon === 'users'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <!-- tag icon -->
                <svg v-if="item.icon === 'tag'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <!-- cog icon -->
                <svg v-if="item.icon === 'cog'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <!-- chart icon -->
                <svg v-if="item.icon === 'chart'" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {{ item.label }}
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <!-- ══ MAIN CONTENT ══════════════════════════════════════════════════ -->
      <main class="flex-1 min-w-0">

        <!-- ────────────────────────────────────────────────────────────────────
             SEKCE: Správa limitů
        ──────────────────────────────────────────────────────────────────── -->
        <div v-if="activeSection === 'budget'" class="space-y-5">

          <!-- Default budget config -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 class="text-base font-semibold text-gray-800 mb-1">Výchozí limit pro nové uživatele</h2>
            <p class="text-sm text-gray-400 mb-4">Automaticky přidělen při registraci. Existujíci uživatelé nejsou ovlivněni.</p>
            <div class="flex items-end gap-4 flex-wrap">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Limit (USD, prázdné = neomezeno)</label>
                <div class="flex items-center gap-1">
                  <span class="text-gray-400 text-sm">$</span>
                  <input
                    v-model="defLimitInput"
                    type="number" min="0" step="0.5" placeholder="neomezeno"
                    class="w-32 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Reset perioda</label>
                <select
                  v-model="defBudget.resetPeriod"
                  class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option v-for="(label, val) in RESET_PERIOD_LABELS" :key="val" :value="val">{{ label }}</option>
                </select>
              </div>
              <button
                class="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                @click="saveDefaultBudget"
              >Uložit výchozí</button>
            </div>
          </div>

          <!-- User list + edit panel -->
          <div class="flex gap-4">

            <!-- User list -->
            <div class="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div class="px-5 py-4 border-b border-gray-100">
                <h2 class="text-sm font-semibold text-gray-800">Uživatelé ({{ budgetUsers.length }})</h2>
                <p class="text-xs text-gray-400 mt-0.5">Spotřeba za posledních 30 dní</p>
              </div>
              <ul class="divide-y divide-gray-50">
                <li
                  v-for="u in budgetUsers"
                  :key="u.id"
                  class="px-5 py-3.5 cursor-pointer hover:bg-indigo-50/40 transition-colors"
                  :class="{ 'bg-indigo-50': selectedBudgetUserId === u.id }"
                  @click="selectedBudgetUserId = selectedBudgetUserId === u.id ? null : u.id"
                >
                  <div class="flex items-center gap-3">
                    <!-- Avatar -->
                    <img v-if="u.image" :src="u.image" :alt="u.name" class="w-7 h-7 rounded-full shrink-0" referrerpolicy="no-referrer" />
                    <div v-else class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shrink-0 flex items-center justify-center text-xs font-bold text-white">
                      {{ u.name.charAt(0) }}
                    </div>
                    <!-- Name + email -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-sm font-medium text-gray-800 truncate">{{ u.name }}</span>
                        <span v-if="u.isSuperAdmin" class="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">SA</span>
                      </div>
                      <!-- Usage bar -->
                      <div class="mt-1">
                        <div v-if="u.budget?.limitUsd" class="flex items-center gap-2">
                          <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              class="h-1 rounded-full transition-all"
                              :class="(budgetPct(u) ?? 0) > 90 ? 'bg-red-400' : (budgetPct(u) ?? 0) > 70 ? 'bg-amber-400' : 'bg-emerald-400'"
                              :style="`width: ${budgetPct(u)}%`"
                            />
                          </div>
                          <span class="text-[11px] text-gray-400 shrink-0 tabular-nums">
                            ${{ u.budget.usedUsd.toFixed(2) }} / ${{ u.budget.limitUsd.toFixed(2) }}
                          </span>
                        </div>
                        <div v-else class="text-[11px] text-gray-400">
                          <span v-if="u.budget?.limitUsd === null && u.budget">∞ nezomezeno</span>
                          <span v-else>${{ u.stats30d.aiCost.toFixed(3) }} (30d)</span>
                        </div>
                      </div>
                    </div>
                    <!-- Stats chips -->
                    <div class="hidden sm:flex items-center gap-1.5 shrink-0">
                      <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full" title="AI requesty">
                        🤖 {{ u.stats30d.aiCount }}
                      </span>
                      <span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full" title="SerpAPI vyhledávání">
                        🔍 {{ u.stats30d.serpCount }}
                      </span>
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Edit panel -->
            <div v-if="selectedBudgetUser" class="w-72 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 self-start sticky top-6">
              <div class="flex items-center gap-2 mb-4">
                <img v-if="selectedBudgetUser.image" :src="selectedBudgetUser.image" :alt="selectedBudgetUser.name" class="w-8 h-8 rounded-full" referrerpolicy="no-referrer" />
                <div v-else class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                  {{ selectedBudgetUser.name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-gray-800 truncate">{{ selectedBudgetUser.name }}</div>
                  <div class="text-[11px] text-gray-400 truncate">{{ selectedBudgetUser.email }}</div>
                </div>
              </div>

              <!-- Current usage summary -->
              <div class="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-600 space-y-1">
                <div class="flex justify-between">
                  <span class="text-gray-400">Spotřeba (period.)</span>
                  <span class="font-semibold">${{ selectedBudgetUser.budget?.usedUsd.toFixed(3) ?? '0.000' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Limit</span>
                  <span class="font-semibold">{{ selectedBudgetUser.budget?.limitUsd != null ? '$' + selectedBudgetUser.budget.limitUsd.toFixed(2) : '∞' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Reset</span>
                  <span class="font-semibold">{{ RESET_PERIOD_LABELS[selectedBudgetUser.budget?.resetPeriod ?? 'never'] }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">AI requesty (30d)</span>
                  <span>{{ selectedBudgetUser.stats30d.aiCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">SerpAPI (30d)</span>
                  <span>{{ selectedBudgetUser.stats30d.serpCount }}</span>
                </div>
              </div>

              <!-- Edit form -->
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">Limit (USD)</label>
                  <div class="flex items-center gap-1">
                    <span class="text-gray-400 text-sm">$</span>
                    <input
                      v-model="editLimitInput"
                      type="number" min="0" step="0.5" placeholder="neomezeno"
                      class="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 mb-1">Reset perioda</label>
                  <select
                    v-model="editResetPeriod"
                    class="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    <option v-for="(label, val) in RESET_PERIOD_LABELS" :key="val" :value="val">{{ label }}</option>
                  </select>
                </div>
                <button
                  class="w-full py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                  @click="saveBudgetUser"
                >Uložit změny</button>
                <button
                  class="w-full py-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm rounded-lg hover:bg-amber-100 transition-colors"
                  @click="resetBudgetCounter(selectedBudgetUser!.id)"
                >Resetovat čítač spotřeby</button>
              </div>
            </div>

          </div>
        </div>

        <!-- ────────────────────────────────────────────────────────────────────
             SEKCE: Moje oprávnění
        ──────────────────────────────────────────────────────────────────── -->
        <div v-if="activeSection === 'permissions' && me" class="space-y-5">
          <!-- Header card -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 class="text-base font-semibold text-gray-800 mb-1">Moje oprávnění</h2>
            <p class="text-sm text-gray-400 mb-5">Přehled vašich platných oprávnění (kombinace rolí a individuálních nastavení).</p>

            <!-- Roles & budget row -->
            <div class="flex flex-wrap items-center gap-2">
              <span v-if="me.user.isSuperAdmin" class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                ⭐ Superadmin
              </span>
              <span
                v-for="role in me.roles"
                :key="role.id"
                class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border"
                :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
              >
                <span class="w-1.5 h-1.5 rounded-full" :style="`background: ${role.color}`" />
                {{ role.name }}
              </span>
              <span v-if="me.roles.length === 0 && !me.user.isSuperAdmin" class="text-xs text-gray-400">Žádná přiřazená role (výchozí oprávnění)</span>
              <span v-if="me.budget" class="ml-auto text-xs text-gray-500 tabular-nums">
                Budget: ${{ me.budget.usedUsd.toFixed(2) }} / {{ me.budget.limitUsd != null ? `$${me.budget.limitUsd.toFixed(2)}` : 'neomezeno' }}
              </span>
            </div>
          </div>

          <!-- Permission groups as cards grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              v-for="(group, gi) in PERMISSION_GROUPS"
              :key="gi"
              class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div class="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ group.label }}</span>
              </div>
              <ul class="divide-y divide-gray-50">
                <li
                  v-for="key in group.keys"
                  :key="key"
                  class="flex items-center justify-between px-4 py-2.5"
                >
                  <span class="text-sm text-gray-700">{{ PERMISSION_LABELS[key] }}</span>
                  <span v-if="me.effectivePermissions.includes(key)" class="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
                    Ano
                  </span>
                  <span v-else class="flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    Ne
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- ────────────────────────────────────────────────────────────────
             SEKCE: Správa uživatelů
        ──────────────────────────────────────────────────────────────────── -->
        <div v-else-if="activeSection === 'users'" class="space-y-4">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 class="text-base font-semibold text-gray-800">Správa uživatelů</h2>
                <p class="text-xs text-gray-400 mt-0.5">Přiřazujte role a nastavujte individuální oprávnění.</p>
              </div>
              <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                {{ adminUsers?.length ?? 0 }} uživatelů
              </span>
            </div>

            <div v-if="!adminUsers || adminUsers.length === 0" class="py-16 text-center text-gray-400 text-sm">
              Žádní uživatelé.
            </div>

            <template v-else>
              <!-- User list -->
              <div class="divide-y divide-gray-50">
                <template v-for="u in adminUsers" :key="u.id">

                  <!-- User row -->
                  <div
                    class="px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
                    :class="selectedUserId === u.id ? 'bg-indigo-50/40' : ''"
                    @click="selectUser(u.id)"
                  >
                    <div class="flex items-center gap-3">
                      <!-- Avatar -->
                      <img v-if="u.image" :src="u.image" :alt="u.name" class="w-9 h-9 rounded-full shrink-0" referrerpolicy="no-referrer" />
                      <div v-else class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shrink-0 flex items-center justify-center text-sm font-bold text-white">
                        {{ u.name.charAt(0).toUpperCase() }}
                      </div>

                      <!-- Name / email -->
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="font-medium text-gray-800 text-sm">{{ u.name }}</span>
                          <span v-if="u.isSuperAdmin" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">SA</span>
                          <span v-if="u.id === me?.user.id" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">Já</span>
                        </div>
                        <div class="text-xs text-gray-400 mt-0.5">{{ u.email }}</div>
                      </div>

                      <!-- Role pills -->
                      <div class="hidden sm:flex flex-wrap gap-1 max-w-[220px]">
                        <span v-if="u.isSuperAdmin" class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Superadmin</span>
                        <span
                          v-for="role in u.roles"
                          :key="role.id"
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                          :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
                        >{{ role.name }}</span>
                        <span
                          v-for="g in u.groups"
                          :key="g.id"
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                          :style="`background-color: ${g.color}18; border-color: ${g.color}44; color: ${g.color}`"
                        >{{ g.name }}</span>
                        <span v-if="!u.isSuperAdmin && u.roles.length === 0 && u.groups.length === 0" class="text-xs text-gray-300">—</span>
                      </div>

                      <!-- Budget -->
                      <div class="hidden md:block text-right shrink-0">
                        <span v-if="u.budget" class="text-xs text-gray-500 tabular-nums">
                          ${{ u.budget.usedUsd.toFixed(2) }}<span class="text-gray-300"> / {{ u.budget.limitUsd != null ? `$${u.budget.limitUsd.toFixed(2)}` : '∞' }}</span>
                        </span>
                        <span v-else class="text-gray-300 text-xs">—</span>
                      </div>

                      <!-- Chevron -->
                      <svg
                        class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                        :class="selectedUserId === u.id ? 'rotate-180 text-indigo-400' : ''"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  <!-- ── Expanded panel ── -->
                  <div v-if="selectedUserId === u.id" class="bg-gray-50/60 border-t border-indigo-100/50 px-5 py-5">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                      <!-- Roles -->
                      <div class="bg-white rounded-xl border border-gray-100 p-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Přiřazené role</div>
                        <div class="flex flex-wrap gap-1.5 mb-4 min-h-[28px]">
                          <span
                            v-for="role in u.roles"
                            :key="role.id"
                            class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-70 transition-opacity"
                            :style="`background-color: ${role.color}18; border-color: ${role.color}44; color: ${role.color}`"
                            title="Kliknutím odeberete roli"
                            @click.stop="removeRole(u.id, role.id)"
                          >
                            {{ role.name }}
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                          </span>
                          <span v-if="u.roles.length === 0" class="text-xs text-gray-400">Žádné role</span>
                        </div>

                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Přidat roli</div>
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
                        <div v-if="isSuperAdmin" class="mt-4 pt-4 border-t border-gray-100">
                          <button
                            class="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
                            :class="u.isSuperAdmin ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            :disabled="u.isSuperAdmin && superadminCount <= 1"
                            :title="u.isSuperAdmin && superadminCount <= 1 ? 'Nejprve přidělte superadmin status jinému uživateli' : undefined"
                            @click.stop="toggleSuperAdmin(u)"
                          >
                            {{ u.isSuperAdmin ? '⭐ Odebrat Superadmin' : 'Nastavit jako Superadmin' }}
                          </button>
                          <p v-if="u.isSuperAdmin && superadminCount <= 1" class="text-[10px] text-amber-600 mt-1.5 text-center">
                            Nelze odebrat — jediný superadmin v systému.
                          </p>
                        </div>
                      </div>

                      <!-- Groups -->
                      <div class="bg-white rounded-xl border border-gray-100 p-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Skupiny</div>
                        <div class="flex flex-wrap gap-1.5 mb-4 min-h-[28px]">
                          <span
                            v-for="g in u.groups"
                            :key="g.id"
                            class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-70 transition-opacity"
                            :style="`background-color: ${g.color}18; border-color: ${g.color}44; color: ${g.color}`"
                            title="Kliknutím odeberete ze skupiny"
                            @click.stop="removeGroup(u.id, g.id)"
                          >
                            {{ g.name }}
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                          </span>
                          <span v-if="u.groups.length === 0" class="text-xs text-gray-400">Žádné skupiny</span>
                        </div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Přidat do skupiny</div>
                        <div class="flex flex-wrap gap-1">
                          <button
                            v-for="g in adminGroups?.filter(ag => !u.groups.some(ug => ug.id === ag.id))"
                            :key="g.id"
                            class="text-xs px-2 py-0.5 rounded-full border hover:opacity-80 transition-opacity"
                            :style="`background-color: ${g.color}10; border-color: ${g.color}33; color: ${g.color}`"
                            @click.stop="assignGroup(u.id, g.id)"
                          >+ {{ g.name }}</button>
                        </div>
                      </div>

                      <!-- Permission overrides -->
                      <div class="bg-white rounded-xl border border-gray-100 p-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Individuální oprávnění</div>
                        <div class="space-y-0.5 max-h-64 overflow-y-auto pr-1">
                          <div v-for="group in PERMISSION_GROUPS" :key="group.label">
                            <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2.5 mb-1">{{ group.label }}</div>
                            <label
                              v-for="key in group.keys"
                              :key="key"
                              class="flex items-center gap-2 py-0.5 cursor-pointer"
                            >
                              <select
                                :value="overrideState[key] === undefined ? '' : overrideState[key] === true ? 'grant' : 'deny'"
                                class="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
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
                          class="mt-3 w-full text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                          @click.stop="saveOverrides(u.id)"
                        >Uložit oprávnění</button>
                      </div>

                      <!-- Budget -->
                      <div class="bg-white rounded-xl border border-gray-100 p-4">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Budget</div>
                        <div class="flex items-baseline gap-1 mb-4">
                          <span class="text-2xl font-bold text-gray-800 tabular-nums">${{ u.budget?.usedUsd.toFixed(2) ?? '0.00' }}</span>
                          <span class="text-xs text-gray-400">využito</span>
                        </div>
                        <div v-if="u.budget?.limitUsd != null" class="mb-4">
                          <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              class="h-1.5 rounded-full bg-indigo-400 transition-all"
                              :style="`width: ${Math.min(100, (u.budget.usedUsd / u.budget.limitUsd) * 100)}%`"
                            />
                          </div>
                          <div class="text-[11px] text-gray-400 mt-1 text-right">limit ${{ u.budget.limitUsd.toFixed(2) }}</div>
                        </div>
                        <label class="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Limit (USD)</label>
                        <div class="flex gap-2 items-center">
                          <input
                            v-model="budgetInput"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="neomezeno"
                            class="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          />
                          <span class="text-xs text-gray-400 shrink-0">USD</span>
                        </div>
                        <button
                          class="mt-3 w-full text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                          @click.stop="saveBudget(u.id)"
                        >Nastavit limit</button>
                      </div>
                    </div>
                  </div>

                </template>
              </div>
            </template>
          </div>
        </div>

        <!-- ────────────────────────────────────────────────────────────────
             SEKCE: Správa rolí
        ──────────────────────────────────────────────────────────────────── -->
        <div v-else-if="activeSection === 'roles'" class="space-y-4">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 class="text-base font-semibold text-gray-800">Správa rolí</h2>
                <p class="text-xs text-gray-400 mt-0.5">Vytvářejte a upravujte sady oprávnění.</p>
              </div>
              <button
                class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                @click="openCreateRole"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                Nová role
              </button>
            </div>

            <div v-if="!adminRoles || adminRoles.length === 0" class="py-16 text-center text-gray-400 text-sm">
              Žádné role.
            </div>

            <div v-else class="divide-y divide-gray-50">
              <div
                v-for="role in adminRoles"
                :key="role.id"
                class="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors"
              >
                <!-- Color dot + name -->
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <span class="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-1" :style="`background: ${role.color}; ring-color: ${role.color}55`" />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-gray-800 text-sm">{{ role.name }}</span>
                      <span v-if="role.isSystem" class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">systém</span>
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5 truncate">{{ role.description ?? 'Bez popisu' }}</div>
                  </div>
                </div>

                <!-- Permission chips -->
                <div class="hidden lg:flex flex-wrap gap-1 max-w-xs">
                  <span
                    v-for="key in role.permissions.slice(0, 4)"
                    :key="key"
                    class="text-[10px] px-1.5 py-0.5 rounded-full border"
                    :style="`background-color: ${role.color}10; border-color: ${role.color}33; color: ${role.color}`"
                  >{{ PERMISSION_LABELS[key]?.split(' ').slice(0,2).join(' ') ?? key }}</span>
                  <span v-if="role.permissions.length > 4" class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                    +{{ role.permissions.length - 4 }}
                  </span>
                </div>

                <!-- Count badge -->
                <span class="text-xs font-medium text-gray-500 tabular-nums shrink-0">
                  {{ role.permissions.length }}&thinsp;/&thinsp;{{ ALL_PERMISSION_KEYS.length }}
                </span>

                <!-- Actions -->
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    class="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors font-medium"
                    @click="openEditRole(role)"
                  >Upravit</button>
                  <button
                    class="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="role.isSystem"
                    :title="role.isSystem ? 'Systémové role nelze smazat' : 'Smazat'"
                    @click="deleteRole(role)"
                  >Smazat</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ────────────────────────────────────────────────────────────────
             SEKCE: Systémová nastavení (placeholder)
        ──────────────────────────────────────────────────────────────────── -->
        <div v-else-if="activeSection === 'system'" class="space-y-6">
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-6 py-5 border-b border-gray-100">
              <h2 class="text-base font-semibold text-gray-800">Odvětví partnerů</h2>
              <p class="text-sm text-gray-400 mt-1">Kanonický seznam odvětví, ze kterého AI vybírá při profilování partnerů.</p>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="tag in industryTags" :key="tag"
                  class="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-200 transition-colors text-indigo-400 hover:text-indigo-700"
                    @click="removeTag(tag)"
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
                <span v-if="industryTags.length === 0 && !industryTagsLoading" class="text-sm text-gray-400 py-1.5">Zatím žádné štítky</span>
              </div>
              <form class="flex gap-2" @submit.prevent="addTag">
                <input
                  v-model="newTag"
                  type="text"
                  placeholder="Nové odvětví..."
                  class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  @keydown.enter.prevent="addTag"
                />
                <button
                  type="submit"
                  :disabled="!newTag.trim()"
                  class="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                >Přidat</button>
              </form>
            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- ── Role modal ──────────────────────────────────────────────────────── -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="showRoleModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="font-semibold text-gray-800">{{ editingRole ? 'Upravit roli' : 'Nová role' }}</h3>
            <button class="text-gray-400 hover:text-gray-600 transition-colors" @click="showRoleModal = false">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">Název</label>
              <input v-model="roleForm.name" type="text" required placeholder="Název role" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5">Popis <span class="font-normal text-gray-400">(volitelně)</span></label>
              <input v-model="roleForm.description" type="text" placeholder="Stručný popis role" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-2">Barva</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="c in ROLE_COLORS"
                  :key="c"
                  type="button"
                  class="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                  :style="`background: ${c}; border-color: ${roleForm.color === c ? c : 'transparent'}`"
                  :class="roleForm.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''"
                  @click="roleForm.color = c"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-2">Oprávnění</label>
              <div class="space-y-0.5 border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                <div v-for="group in PERMISSION_GROUPS" :key="group.label">
                  <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-3 mb-1 first:mt-0">{{ group.label }}</div>
                  <label
                    v-for="key in group.keys"
                    :key="key"
                    class="flex items-center gap-2.5 py-0.5 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      :checked="roleForm.permissions.includes(key)"
                      class="accent-indigo-600 w-3.5 h-3.5"
                      @change="toggleRolePerm(key)"
                    />
                    <span class="text-xs text-gray-700 group-hover:text-gray-900">{{ PERMISSION_LABELS[key] }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button
              :disabled="roleSaving || !roleForm.name.trim()"
              class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              @click="saveRole"
            >{{ roleSaving ? 'Ukládám…' : 'Uložit' }}</button>
            <button class="text-sm text-gray-400 hover:text-gray-600 px-3 transition-colors" @click="showRoleModal = false">Zrušit</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>
