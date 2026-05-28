<script setup lang="ts">
defineProps<{ message: string }>()
</script>
<template>
  <div class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
    <span class="text-3xl opacity-50">📭</span>
    <span>{{ message }}</span>
  </div>
</template>
