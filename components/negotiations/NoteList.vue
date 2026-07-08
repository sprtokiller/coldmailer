<script setup lang="ts">
interface AssigneeUser { id: string; name: string; image: string | null }
interface InteractionAssignee { userId: string; user: AssigneeUser }
interface NoteItem {
  type: 'NOTE'
  id: string
  content: string | null
  createdAt: string
  updatedAt: string
  creator: AssigneeUser
  assignees: InteractionAssignee[]
  canEdit: boolean
}

const props = defineProps<{
  notes: NoteItem[]
  showTypeBadge: boolean
  editingId: string | null
  editingContent: string
}>()

const emit = defineEmits<{
  'start-edit': [NoteItem]
  'update:editingContent': [string]
  save: []
  cancel: []
  delete: [NoteItem]
}>()

function fmtDate(d: string) {
  return new Date(d).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div
    v-for="i in notes"
    :key="i.id"
    class="border rounded-xl p-4 transition-colors border-gray-200 bg-white"
  >
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
        <span v-if="showTypeBadge" class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-50 text-violet-600 shrink-0">Poznámka</span>
        <img v-if="i.creator.image" :src="i.creator.image" :alt="i.creator.name" :title="i.creator.name" class="w-4 h-4 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" />
        <div v-else :title="i.creator.name" class="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ i.creator.name.charAt(0).toUpperCase() }}</div>
        <template v-for="a in i.assignees" :key="a.userId">
          <span class="text-gray-300">+</span>
          <img v-if="a.user.image" :src="a.user.image" :alt="a.user.name" :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white object-cover shrink-0" referrerpolicy="no-referrer" />
          <div v-else :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white bg-indigo-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ a.user.name.charAt(0).toUpperCase() }}</div>
        </template>
        <span class="truncate">{{ i.creator.name }}</span>
        <span class="text-gray-300 shrink-0">&middot;</span>
        <span class="text-gray-300 shrink-0">{{ fmtDate(i.createdAt) }}</span>
        <span v-if="i.createdAt !== i.updatedAt" class="text-gray-300 shrink-0">(upraveno)</span>
      </div>
      <div v-if="i.canEdit" class="flex items-center gap-1 flex-shrink-0">
        <button class="text-xs text-gray-300 hover:text-indigo-500 transition-colors" @click.stop="emit('start-edit', i)">upravit</button>
        <button title="Smazat" class="p-1 text-gray-300 hover:text-red-400 transition-colors" @click.stop="emit('delete', i)">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>

    <div v-if="editingId === i.id">
      <textarea
        :value="editingContent"
        rows="3"
        class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none"
        @input="emit('update:editingContent', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="flex gap-2 mt-2">
        <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="emit('save')">Uložit</button>
        <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors" @click="emit('cancel')">Zrušit</button>
      </div>
    </div>
    <p v-else-if="i.content" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{{ i.content }}</p>
  </div>

  <p v-if="!notes.length" class="text-center py-16 text-gray-300 text-sm select-none">
    Žádná jednání tohoto typu
  </p>
</template>
