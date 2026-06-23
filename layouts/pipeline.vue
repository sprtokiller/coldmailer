<template>
  <div class="min-h-screen bg-gray-50 font-sans">
    <div v-if="syncError === 'auth-error'" class="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2 text-sm text-red-700">
        <span>Synchronizace emailů selhala kvůli ověření.</span>
        <a href="/api/auth/login" class="underline font-medium hover:text-red-900">Přihlásit se znovu</a>
      </div>
      <button class="text-red-400 hover:text-red-600 text-lg leading-none" @click="syncError = null">&times;</button>
    </div>
    <AppNav />
    <main class="py-8">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { syncError } = useGmailSync()
</script>
