<script setup lang="ts">
import {
  type AdminUser, type GroupInfo, type MeResponse,
} from '~/utils/settings-constants'

const props = defineProps<{
  me: MeResponse
  adminUsers: AdminUser[] | null
  adminGroups: GroupInfo[] | null
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'refreshUsers'): void
  (e: 'refreshGroups'): void
}>()

const selectedUserId = ref<string | null>(null)
const selectedUser = computed(() => props.adminUsers?.find(u => u.id === selectedUserId.value) ?? null)

const allProjectRoles = computed(() => {
  if (!props.adminGroups) return []
  return props.adminGroups.flatMap(group =>
    group.projects.flatMap(project =>
      (project.projectRoles ?? []).map(role => ({
        ...role,
        project: { ...project, group: { id: group.id, name: group.name, slug: group.slug, color: group.color } },
      })),
    ),
  )
})

function selectUser(userId: string) {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

// ── Assign / remove project role ─────────────────────────────────────────
async function assignProjectRole(userId: string, projectRoleId: string) {
  await $fetch(`/api/admin/users/${userId}/project-roles`, { method: 'POST', body: { projectRoleId } })
  emit('refreshUsers')
}
async function removeProjectRole(userId: string, projectRoleId: string) {
  await $fetch(`/api/admin/users/${userId}/project-roles/${projectRoleId}`, { method: 'DELETE' })
  emit('refreshUsers')
}

// ── Budget ─────────────────────────────────────────────────────────────────
const budgetInput = ref<string>('')
watch(selectedUser, (u) => {
  budgetInput.value = u?.budget?.limitUsd != null ? String(u.budget.limitUsd) : ''
})
async function saveBudget(userId: string) {
  const limitUsd = budgetInput.value.trim() === '' ? null : parseFloat(budgetInput.value)
  await $fetch(`/api/admin/users/${userId}/budget`, { method: 'PATCH', body: { limitUsd } })
  emit('refreshUsers')
}

// ── Admin toggle ──────────────────────────────────────────────────────────
const adminCount = computed(() => props.adminUsers?.filter(u => u.isAdmin).length ?? 0)

async function toggleAdmin(user: AdminUser) {
  if (!confirm(`${user.isAdmin ? 'Odebrat' : 'Přidělit'} admin status uživateli ${user.name}?`)) return
  await $fetch(`/api/admin/users/${user.id}/admin`, { method: 'PATCH', body: { isAdmin: !user.isAdmin } })
  emit('refreshUsers')
}

function availableProjectRoles(user: AdminUser) {
  const assigned = new Set(user.projectRoles.map(pr => pr.id))
  return allProjectRoles.value.filter(pr => !assigned.has(pr.id))
}
</script>

<template>
  <div class="space-y-4">
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-800">Správa uživatelů</h2>
          <p class="text-xs text-gray-400 mt-0.5">Přiřazujte projektové role a spravujte administrátory.</p>
        </div>
        <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
          {{ adminUsers?.length ?? 0 }} uživatelů
        </span>
      </div>

      <div v-if="!adminUsers || adminUsers.length === 0" class="py-16 text-center text-gray-400 text-sm">
        Žádní uživatelé.
      </div>

      <template v-else>
        <div class="divide-y divide-gray-50">
          <template v-for="u in adminUsers" :key="u.id">

            <!-- User row -->
            <div
              class="px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
              :class="selectedUserId === u.id ? 'bg-indigo-50/40' : ''"
              @click="selectUser(u.id)"
            >
              <div class="flex items-center gap-3">
                <img v-if="u.image" :src="u.image" :alt="u.name" class="w-9 h-9 rounded-full shrink-0" referrerpolicy="no-referrer" />
                <div v-else class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shrink-0 flex items-center justify-center text-sm font-bold text-white">
                  {{ u.name.charAt(0).toUpperCase() }}
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-gray-800 text-sm">{{ u.name }}</span>
                    <span v-if="u.isAdmin" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">ADMIN</span>
                    <span v-if="u.id === me?.user.id" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">Já</span>
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5">{{ u.email }}</div>
                </div>

                <div class="hidden sm:flex flex-wrap gap-1 max-w-[280px]">
                  <span v-if="u.isAdmin" class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">Admin</span>
                  <span
                    v-for="pr in u.projectRoles"
                    :key="pr.id"
                    class="text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                    :style="`background-color: ${pr.project.group.color}18; border-color: ${pr.project.group.color}44; color: ${pr.project.group.color}`"
                  >{{ pr.name }} · {{ pr.project.name }}</span>
                  <span v-if="!u.isAdmin && u.projectRoles.length === 0" class="text-xs text-gray-300">—</span>
                </div>

                <div class="hidden md:block text-right shrink-0">
                  <span v-if="u.budget" class="text-xs text-gray-500 tabular-nums">
                    ${{ u.budget.usedUsd.toFixed(2) }}<span class="text-gray-300"> / {{ u.budget.limitUsd != null ? `$${u.budget.limitUsd.toFixed(2)}` : '∞' }}</span>
                  </span>
                  <span v-else class="text-gray-300 text-xs">—</span>
                </div>

                <svg
                  class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                  :class="selectedUserId === u.id ? 'rotate-180 text-indigo-400' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <!-- Expanded panel -->
            <div v-if="selectedUserId === u.id" class="bg-gray-50/60 border-t border-indigo-100/50 px-5 py-5">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                <!-- Project roles -->
                <div class="bg-white rounded-xl border border-gray-100 p-4">
                  <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Projektové role</div>

                  <div class="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                    <span
                      v-for="pr in u.projectRoles"
                      :key="pr.id"
                      class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-70 transition-opacity"
                      :style="`background-color: ${pr.project.group.color}18; border-color: ${pr.project.group.color}44; color: ${pr.project.group.color}`"
                      :title="`${pr.name} · ${pr.project.name} — kliknutím odeberete`"
                      @click.stop="removeProjectRole(u.id, pr.id)"
                    >
                      {{ pr.name }} · {{ pr.project.name }}
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </span>
                    <span v-if="u.projectRoles.length === 0" class="text-xs text-gray-400">Žádné projektové role</span>
                  </div>

                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Přidat projektovou roli</div>
                  <div class="space-y-1 max-h-40 overflow-y-auto">
                    <button
                      v-for="pr in availableProjectRoles(u)"
                      :key="pr.id"
                      class="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border hover:opacity-80 transition-opacity"
                      :style="`background-color: ${pr.project.group.color}10; border-color: ${pr.project.group.color}33; color: ${pr.project.group.color}`"
                      @click.stop="assignProjectRole(u.id, pr.id)"
                    >
                      <span class="font-medium">+ {{ pr.name }}</span>
                      <span class="ml-1 opacity-70">· {{ pr.project.name }}</span>
                    </button>
                    <span v-if="availableProjectRoles(u).length === 0" class="text-xs text-gray-300 block">Vše přiřazeno</span>
                  </div>

                  <!-- Admin toggle -->
                  <div v-if="isAdmin" class="mt-4 pt-4 border-t border-gray-100">
                    <button
                      class="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full"
                      :class="u.isAdmin ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                      :disabled="u.isAdmin && adminCount <= 1"
                      :title="u.isAdmin && adminCount <= 1 ? 'Nejprve přidělte admin status jinému uživateli' : undefined"
                      @click.stop="toggleAdmin(u)"
                    >
                      {{ u.isAdmin ? '⭐ Odebrat Admin' : 'Nastavit jako Admin' }}
                    </button>
                    <p v-if="u.isAdmin && adminCount <= 1" class="text-[10px] text-amber-600 mt-1.5 text-center">
                      Nelze odebrat — jediný admin v systému.
                    </p>
                  </div>
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
</template>
