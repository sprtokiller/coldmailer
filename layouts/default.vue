<template>
  <div class="min-h-screen bg-gray-50 font-sans">
    <AppNav />
    <main class="container mx-auto max-w-6xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
useHead({})
useGmailSync()
</script>
