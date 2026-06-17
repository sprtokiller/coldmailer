<script setup lang="ts">
import {
  PERMISSION_GROUPS, PERMISSION_LABELS, ALL_PERMISSION_KEYS, ROLE_COLORS,
  type Role,
} from '~/utils/settings-constants'

const props = defineProps<{ adminRoles: Role[] | null }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const showRoleModal = ref(false)
const editingRole = ref<Role | null>(null)
const roleForm = ref({ name: '', description: '', color: '#6366f1', permissions: [] as string[] })
const roleSaving = ref(false)

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
    emit('refresh')
    showRoleModal.value = false
  } finally {
    roleSaving.value = false
  }
}

async function deleteRole(role: Role) {
  if (!confirm(`Opravdu smazat roli "${role.name}"?`)) return
  await $fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
  emit('refresh')
}
</script>

<template>
  <div class="space-y-4">
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

          <span class="text-xs font-medium text-gray-500 tabular-nums shrink-0">
            {{ role.permissions.length }}&thinsp;/&thinsp;{{ ALL_PERMISSION_KEYS.length }}
          </span>

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

  <!-- Role modal -->
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
</template>
