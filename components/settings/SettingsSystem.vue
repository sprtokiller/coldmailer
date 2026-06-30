<script setup lang="ts">
const emailSyncDays = ref(30)
const emailSyncSaving = ref(false)

async function fetchEmailSyncDays() {
  try {
    const data = await $fetch<{ emailSyncHistoryDays: number }>('/api/settings/email-sync')
    emailSyncDays.value = data.emailSyncHistoryDays
  } catch {}
}

async function saveEmailSyncDays() {
  emailSyncSaving.value = true
  try {
    const data = await $fetch<{ emailSyncHistoryDays: number }>('/api/settings/email-sync', {
      method: 'PUT',
      body: { days: emailSyncDays.value },
    })
    emailSyncDays.value = data.emailSyncHistoryDays
  } finally {
    emailSyncSaving.value = false
  }
}

interface AvailableRole { id: string; name: string; color: string }
interface AvailableProjectRole { id: string; name: string; projectName: string; groupName: string }
interface DefaultRolesResponse {
  roleIds: string[]
  projectRoleIds: string[]
  availableRoles: AvailableRole[]
  availableProjectRoles: AvailableProjectRole[]
}

const selectedRoleIds = ref<Set<string>>(new Set())
const selectedProjectRoleIds = ref<Set<string>>(new Set())
const availableRoles = ref<AvailableRole[]>([])
const availableProjectRoles = ref<AvailableProjectRole[]>([])
const defaultRolesSaving = ref(false)

async function fetchDefaultRoles() {
  try {
    const data = await $fetch<DefaultRolesResponse>('/api/admin/default-roles')
    selectedRoleIds.value = new Set(data.roleIds)
    selectedProjectRoleIds.value = new Set(data.projectRoleIds)
    availableRoles.value = data.availableRoles
    availableProjectRoles.value = data.availableProjectRoles
  } catch {}
}

async function saveDefaultRoles() {
  defaultRolesSaving.value = true
  try {
    await $fetch('/api/admin/default-roles', {
      method: 'PUT',
      body: {
        roleIds: [...selectedRoleIds.value],
        projectRoleIds: [...selectedProjectRoleIds.value],
      },
    })
  } finally {
    defaultRolesSaving.value = false
  }
}

function toggleRole(id: string) {
  if (selectedRoleIds.value.has(id)) selectedRoleIds.value.delete(id)
  else selectedRoleIds.value.add(id)
}

function toggleProjectRole(id: string) {
  if (selectedProjectRoleIds.value.has(id)) selectedProjectRoleIds.value.delete(id)
  else selectedProjectRoleIds.value.add(id)
}

onMounted(() => { fetchEmailSyncDays(); fetchDefaultRoles() })
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-gray-100">
        <h2 class="text-base font-semibold text-gray-800">Hloubka synchronizace emailů</h2>
        <p class="text-sm text-gray-400 mt-1">Kolik dní zpětně hledat emaily při první synchronizaci nebo přidání nového kontaktu.</p>
      </div>
      <div class="px-6 py-5">
        <form class="flex items-center gap-3" @submit.prevent="saveEmailSyncDays">
          <input
            v-model.number="emailSyncDays"
            type="number"
            min="1"
            max="365"
            class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <span class="text-sm text-gray-500">dní</span>
          <button
            type="submit"
            :disabled="emailSyncSaving"
            class="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
          >{{ emailSyncSaving ? 'Ukládám...' : 'Uložit' }}</button>
        </form>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-gray-100">
        <h2 class="text-base font-semibold text-gray-800">Výchozí role nových uživatelů</h2>
        <p class="text-sm text-gray-400 mt-1">Role přidělené automaticky při prvním přihlášení nového uživatele do systému.</p>
      </div>
      <div class="px-6 py-5 space-y-5">
        <div v-if="availableRoles.length > 0">
          <p class="text-xs font-medium text-gray-500 mb-2">Globální role</p>
          <div class="space-y-1.5">
            <label
              v-for="role in availableRoles"
              :key="role.id"
              class="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                :checked="selectedRoleIds.has(role.id)"
                class="accent-indigo-500"
                @change="toggleRole(role.id)"
              />
              <span
                class="inline-block w-2 h-2 rounded-full shrink-0"
                :style="{ backgroundColor: role.color }"
              />
              <span class="text-sm text-gray-700">{{ role.name }}</span>
            </label>
          </div>
        </div>

        <div v-if="availableProjectRoles.length > 0">
          <p class="text-xs font-medium text-gray-500 mb-2">Projektové role</p>
          <div class="space-y-1.5">
            <label
              v-for="pr in availableProjectRoles"
              :key="pr.id"
              class="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                :checked="selectedProjectRoleIds.has(pr.id)"
                class="accent-indigo-500"
                @change="toggleProjectRole(pr.id)"
              />
              <span class="text-sm text-gray-700">{{ pr.name }}</span>
              <span class="text-xs text-gray-400">{{ pr.groupName }} / {{ pr.projectName }}</span>
            </label>
          </div>
        </div>

        <p v-if="availableRoles.length === 0 && availableProjectRoles.length === 0" class="text-sm text-gray-400">
          Zatím nejsou definovány žádné role. Nejdřív vytvořte role v sekci Správa rolí.
        </p>

        <button
          type="button"
          :disabled="defaultRolesSaving"
          class="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
          @click="saveDefaultRoles"
        >{{ defaultRolesSaving ? 'Ukládám...' : 'Uložit' }}</button>
      </div>
    </div>
  </div>
</template>
