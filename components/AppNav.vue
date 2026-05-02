<script setup lang="ts">
const { user, loggedIn } = useUserSession()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
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
        <template v-if="loggedIn">
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
            Library
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
          Sign out
        </button>
      </div>
    </div>
  </nav>
</template>
