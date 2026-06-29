<script setup lang="ts">
import type { MeResponse } from '~/utils/settings-constants'

defineProps<{ me: MeResponse }>()
</script>

<template>
  <div class="space-y-5">
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 class="text-base font-semibold text-gray-800 mb-1">Moje oprávnění</h2>
      <p class="text-sm text-gray-400 mb-5">Přehled vaší role a přístupu v systému.</p>

      <div v-if="me.user.isAdmin" class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          ⭐ Admin — plný přístup
        </span>
        <span v-if="me.budget" class="ml-auto text-xs text-gray-500 tabular-nums">
          Budget: ${{ me.budget.usedUsd.toFixed(2) }} / {{ me.budget.limitUsd != null ? `$${me.budget.limitUsd.toFixed(2)}` : 'neomezeno' }}
        </span>
      </div>

      <template v-else>
        <div v-if="me.projectRoles.length === 0" class="text-sm text-gray-400">
          Nejste přiřazeni k žádnému projektu. Kontaktujte administrátora.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="pr in me.projectRoles"
            :key="pr.id"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
            :style="`background-color: ${pr.project.group.color}0d; border-color: ${pr.project.group.color}33`"
          >
            <div
              class="w-2 h-2 rounded-full shrink-0"
              :style="`background-color: ${pr.project.group.color}`"
            />
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium text-gray-800">{{ pr.project.name }}</span>
              <span class="text-xs text-gray-400 ml-1.5">{{ pr.project.group.name }}</span>
            </div>
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-full"
              :style="`background-color: ${pr.project.group.color}22; color: ${pr.project.group.color}`"
            >{{ pr.name }}</span>
          </div>
        </div>

        <div v-if="me.budget" class="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 tabular-nums">
          Budget: ${{ me.budget.usedUsd.toFixed(2) }} / {{ me.budget.limitUsd != null ? `$${me.budget.limitUsd.toFixed(2)}` : 'neomezeno' }}
        </div>
      </template>
    </div>
  </div>
</template>
