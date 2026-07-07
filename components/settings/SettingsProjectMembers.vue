<script setup lang="ts">
import type { ManagedProject } from '~/utils/settings-constants'

defineProps<{ projects: ManagedProject[] }>()

// ── Last login helpers ──────────────────────────────────────────────────────
function lastLoginDays(lastLoginAt: string | null): number | null {
  if (!lastLoginAt) return null
  return Math.floor((Date.now() - new Date(lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
}

function lastLoginLabel(lastLoginAt: string | null): string {
  const days = lastLoginDays(lastLoginAt)
  if (days === null) return 'Nikdy'
  if (days === 0) return 'Dnes'
  if (days === 1) return 'Včera'
  if (days < 7) return `Před ${days} dny`
  if (days < 30) return `Před ${days} dny`
  if (days < 365) return `Před ${Math.floor(days / 30)} měs.`
  return `Před ${Math.floor(days / 365)} r.`
}

function lastLoginColor(lastLoginAt: string | null): string {
  const days = lastLoginDays(lastLoginAt)
  if (days === null) return 'bg-gray-100 text-gray-400 border-gray-200'
  if (days <= 7) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (days <= 30) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-600 border-red-200'
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="projects.length === 0" class="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
      <div class="text-gray-300 text-4xl mb-3">👥</div>
      <p class="text-sm text-gray-400">Nemáte roli vedoucího v žádném projektu.</p>
    </div>

    <div
      v-for="project in projects"
      :key="project.id"
      class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <!-- Project header -->
      <div
        class="px-6 py-4 border-b flex items-center justify-between"
        :style="`border-color: ${project.group.color}22; background: linear-gradient(to right, ${project.group.color}08, transparent)`"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1"
            :style="`background-color: ${project.group.color}; ring-color: ${project.group.color}44`"
          />
          <div>
            <h2 class="text-sm font-semibold text-gray-800">{{ project.name }}</h2>
            <p class="text-xs text-gray-400">{{ project.group.name }}</p>
          </div>
        </div>
        <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
          {{ project.members.length }} {{ project.members.length === 1 ? 'člen' : project.members.length < 5 ? 'členové' : 'členů' }}
        </span>
      </div>

      <!-- Members list -->
      <div v-if="project.members.length === 0" class="py-10 text-center text-gray-300 text-sm">
        Žádní členové.
      </div>

      <div v-else class="divide-y divide-gray-50">
        <div
          v-for="member in project.members"
          :key="member.id"
          class="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 transition-colors"
        >
          <!-- Avatar -->
          <img
            v-if="member.image"
            :src="member.image"
            :alt="member.name"
            class="w-8 h-8 rounded-full shrink-0"
            referrerpolicy="no-referrer"
          />
          <div
            v-else
            class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
            :style="`background: linear-gradient(135deg, ${project.group.color}cc, ${project.group.color}88)`"
          >
            {{ member.name.charAt(0).toUpperCase() }}
          </div>

          <!-- Name & email -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-gray-800">{{ member.name }}</span>
              <span
                v-for="role in member.roles"
                :key="role"
                class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                :style="`background-color: ${project.group.color}18; color: ${project.group.color}`"
              >{{ role }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5 truncate">{{ member.email }}</div>
          </div>

          <!-- Unread mail badge -->
          <span
            v-if="member.unreadEmailCount > 0"
            class="text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 whitespace-nowrap bg-red-50 text-red-600 border-red-200"
            title="Nepřečtené e-maily v jednáních, kde je člen oslovovatel nebo řešitel"
          >
            ✉ {{ member.unreadEmailCount }} nepřečteno
          </span>

          <!-- Last login badge -->
          <span
            class="text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 whitespace-nowrap"
            :class="lastLoginColor(member.lastLoginAt)"
            :title="member.lastLoginAt
              ? `Poslední aktivita: ${new Date(member.lastLoginAt).toLocaleString('cs-CZ')}`
              : 'Uživatel ještě nebyl v aplikaci'"
          >
            🕐 {{ lastLoginLabel(member.lastLoginAt) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
