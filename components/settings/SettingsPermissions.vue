<script setup lang="ts">
import { PERMISSION_GROUPS, PERMISSION_LABELS, type MeResponse } from '~/utils/settings-constants'

defineProps<{ me: MeResponse }>()
</script>

<template>
  <div class="space-y-5">
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
</template>
