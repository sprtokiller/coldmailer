<script setup lang="ts">
import { parseTodoLines, formatTodoDate, todoUrgency, todoColorClass } from '~/utils/checklist'

const props = defineProps<{
  content: string | null
  canEdit: boolean
  editing: boolean
  editingValue: string
  togglingLineIndex: number | null
}>()

const emit = defineEmits<{
  'start-edit': []
  'update:editingValue': [string]
  save: []
  'cancel-edit': []
  'toggle-line': [number]
}>()

const lines = computed(() => (props.content ? parseTodoLines(props.content) : []))
const checkedCount = computed(() => lines.value.filter(l => l.checked).length)

function badgeClass(dueDate: Date | null, checked: boolean): string {
  if (checked || !dueDate) return 'bg-amber-100 text-amber-700'
  const cls = todoColorClass(todoUrgency(dueDate))
  return cls || 'bg-amber-100 text-amber-700'
}

function isOverdueOrToday(dueDate: Date | null, checked: boolean): boolean {
  if (checked || !dueDate) return false
  const u = todoUrgency(dueDate)
  return u === 'overdue' || u === 'today'
}

const textarea = ref<HTMLTextAreaElement[] | null>(null)
watch(() => props.editing, (editing) => {
  if (editing) nextTick(() => textarea.value?.[0]?.focus())
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <h4 class="text-xs font-semibold text-amber-800">To-Do</h4>
      <div class="flex items-center gap-2">
        <span v-if="content" class="text-[10px] text-amber-400">{{ checkedCount }}/{{ lines.length }}</span>
        <button v-if="canEdit" class="text-[10px] text-gray-400 transition-colors hover:text-amber-600" @click.stop="emit('start-edit')">✏️</button>
      </div>
    </div>
    <div v-if="content && lines.length > 0" class="w-full rounded-full h-1 mb-2 overflow-hidden bg-amber-100">
      <div class="h-1 rounded-full transition-all duration-300 bg-amber-500" :style="{ width: (checkedCount / lines.length * 100) + '%' }" />
    </div>
    <div v-if="editing">
      <textarea
        ref="textarea"
        :value="editingValue"
        rows="8"
        placeholder="Každý řádek = jeden úkol, např.:&#10;- [ ] 24. 7. 2026 Poslat smlouvu&#10;- [x] Zavolat kontaktu"
        class="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none resize-none bg-white font-mono border-amber-200 focus:border-amber-400"
        @input="emit('update:editingValue', ($event.target as HTMLTextAreaElement).value)"
        @blur="emit('save')"
        @keydown.escape="emit('cancel-edit')"
      />
      <p class="text-[10px] text-gray-400 mt-1">Formát: <code>- [ ] 24. 7. 2026 Popis úkolu</code> — datum je volitelné, české číselné.</p>
    </div>
    <div v-else class="rounded-lg p-3 min-h-[3rem] bg-amber-50">
      <div v-if="content" class="space-y-1">
        <label
          v-for="item in lines"
          :key="item.lineIndex"
          :class="[
            'flex items-start gap-2 py-0.5 rounded transition-all duration-200 group',
            canEdit ? ['cursor-pointer', 'hover:bg-amber-100/50'] : 'cursor-default',
            togglingLineIndex === item.lineIndex ? 'opacity-50' : '',
          ]"
          @click.prevent="canEdit && emit('toggle-line', item.lineIndex)"
        >
          <span :class="['flex-shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center text-[10px] transition-all duration-200', item.checked ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 bg-white group-hover:border-amber-400']">
            <span v-if="item.checked">✓</span>
          </span>
          <span class="flex items-start gap-1.5 flex-wrap leading-snug">
            <span
              v-if="item.dueDate"
              :class="['inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium', badgeClass(item.dueDate, item.checked)]"
            >
              <span v-if="isOverdueOrToday(item.dueDate, item.checked)" class="font-bold">!</span>
              {{ formatTodoDate(item.dueDate) }}
            </span>
            <span :class="['text-sm transition-all duration-200', item.checked ? 'line-through text-gray-400' : 'text-gray-700']">{{ item.label }}</span>
          </span>
        </label>
      </div>
      <p v-else class="text-xs text-gray-400 italic cursor-pointer" @click="canEdit && emit('start-edit')">Klikněte pro přidání úkolů...</p>
    </div>
  </div>
</template>
