<script setup lang="ts">
const props = defineProps<{
  globalRecordId: string
  mode: 'NOTE' | null
}>()

const emit = defineEmits<{ cancel: []; created: [] }>()

const toast = useToast()

const noteForm = ref({ content: '' })

watch(() => props.mode, () => { noteForm.value = { content: '' } })

async function createNote() {
  if (!noteForm.value.content.trim()) return
  await $fetch(`/api/partners/${props.globalRecordId}/notes`, {
    method: 'POST',
    body: { content: noteForm.value.content.trim() },
  })
  noteForm.value = { content: '' }
  toast.show('Poznámka přidána', 'success')
  emit('created')
}
</script>

<template>
  <div v-if="mode === 'NOTE'" class="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
    <textarea v-model="noteForm.content" rows="3" placeholder="Nová poznámka..." class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none mb-3" />
    <div class="flex justify-end gap-2">
      <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50" @click="emit('cancel')">Zrušit</button>
      <button :disabled="!noteForm.content.trim()" class="text-sm px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors" @click="createNote">Přidat poznámku</button>
    </div>
  </div>
</template>
