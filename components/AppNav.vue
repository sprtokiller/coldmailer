<script setup lang="ts">
const { user, loggedIn, clear } = useUserSession()
const { groups, activeGroup, setGroup } = useActiveGroup()

const groupMenuOpen = ref(false)

function selectGroup(id: string) {
  groupMenuOpen.value = false
  setGroup(id)
}

function closeGroupMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.group-selector')) groupMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', closeGroupMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeGroupMenu))

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <nav class="bg-white border-b border-gray-100 shadow-sm">
    <div class="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-6">
        <NuxtLink to="/" class="text-lg font-semibold tracking-tight">
          <span class="text-primary">S</span><span class="text-success">C</span><span class="text-danger">G</span> ColdMailer
        </NuxtLink>

        <!-- Group selector -->
        <div v-if="loggedIn && groups.length > 0" class="relative group-selector">
          <button
            v-if="groups.length > 1"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium border transition-colors"
            :class="groupMenuOpen ? 'border-gray-300 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
            @click.stop="groupMenuOpen = !groupMenuOpen"
          >
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: activeGroup?.color ?? '#6366f1' }" />
            <span class="text-gray-700">{{ activeGroup?.name }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 transition-transform" :class="groupMenuOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div v-else class="flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium text-gray-700">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: activeGroup?.color ?? '#6366f1' }" />
            {{ activeGroup?.name }}
          </div>

          <div
            v-if="groupMenuOpen && groups.length > 1"
            class="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44"
          >
            <button
              v-for="g in groups"
              :key="g.id"
              class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
              :class="g.id === activeGroup?.id ? 'bg-gray-50 font-medium text-gray-800' : 'text-gray-600 hover:bg-gray-50'"
              @click="selectGroup(g.id)"
            >
              <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: g.color }" />
              {{ g.name }}
            </button>
          </div>
        </div>

        <template v-if="loggedIn">
          <NuxtLink
            to="/partners"
            class="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            active-class="text-gray-800 font-medium"
          >
            Partneři
          </NuxtLink>
          <NuxtLink
            to="/"
            class="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            active-class="text-gray-800 font-medium"
          >
            Pipelines
          </NuxtLink>
          <NuxtLink
            to="/library"
            class="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            active-class="text-gray-800 font-medium"
          >
            Knihovna
          </NuxtLink>
          <NuxtLink
            to="/records"
            class="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            active-class="text-gray-800 font-medium"
          >
            Databáze
          </NuxtLink>
          <NuxtLink
            to="/settings"
            class="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            active-class="text-gray-800 font-medium"
          >
            Nastavení
          </NuxtLink>
        </template>
      </div>

      <div v-if="loggedIn && user" class="flex items-center gap-3">
        <span class="text-sm text-gray-600 hidden sm:block">{{ user.name }}</span>
        <img
          v-if="user.image"
          :src="user.image"
          :alt="user.name"
          class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100"
          referrerpolicy="no-referrer"
        />
        <div
          v-else
          class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold"
        >
          {{ user.name.charAt(0).toUpperCase() }}
        </div>
        <button
          class="text-xs text-gray-400 hover:text-danger transition-colors"
          @click="logout"
        >
          Odhlásit se
        </button>
      </div>
    </div>
  </nav>
</template>
