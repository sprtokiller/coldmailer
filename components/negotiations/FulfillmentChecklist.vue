<script setup lang="ts">
import { parseChecklistLines } from '~/utils/checklist'

const props = defineProps<{
  title: string
  theme: 'blue' | 'green'
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

const THEME = {
  blue: {
    heading: 'text-blue-800', count: 'text-blue-400', hoverEdit: 'hover:text-blue-600',
    progressTrack: 'bg-blue-100', progressBar: 'bg-blue-500',
    textareaBorder: 'border-blue-200 focus:border-blue-400',
    box: 'bg-blue-50', hoverItem: 'hover:bg-blue-100/50',
    checkOn: 'bg-blue-500 border-blue-500 text-white', checkOff: 'border-blue-300 bg-white group-hover:border-blue-400',
  },
  green: {
    heading: 'text-green-800', count: 'text-green-400', hoverEdit: 'hover:text-green-600',
    progressTrack: 'bg-green-100', progressBar: 'bg-green-500',
    textareaBorder: 'border-green-200 focus:border-green-400',
    box: 'bg-green-50', hoverItem: 'hover:bg-green-100/50',
    checkOn: 'bg-green-500 border-green-500 text-white', checkOff: 'border-green-300 bg-white group-hover:border-green-400',
  },
} as const

const t = computed(() => THEME[props.theme])
const lines = computed(() => (props.content ? parseChecklistLines(props.content) : []))
const checkedCount = computed(() => lines.value.filter(l => l.checked).length)

const textarea = ref<HTMLTextAreaElement[] | null>(null)
watch(() => props.editing, (editing) => {
  if (editing) nextTick(() => textarea.value?.[0]?.focus())
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1">
      <h4 :class="['text-xs font-semibold', t.heading]">{{ title }}</h4>
      <div class="flex items-center gap-2">
        <span v-if="content" :class="['text-[10px]', t.count]">{{ checkedCount }}/{{ lines.length }}</span>
        <button v-if="canEdit" :class="['text-[10px] text-gray-400 transition-colors', t.hoverEdit]" @click.stop="emit('start-edit')">✏️</button>
      </div>
    </div>
    <div v-if="content && lines.length > 0" :class="['w-full rounded-full h-1 mb-2 overflow-hidden', t.progressTrack]">
      <div :class="['h-1 rounded-full transition-all duration-300', t.progressBar]" :style="{ width: (checkedCount / lines.length * 100) + '%' }" />
    </div>
    <div v-if="editing">
      <textarea
        ref="textarea"
        :value="editingValue"
        rows="6"
        placeholder="Každý řádek = jedna položka..."
        :class="['w-full text-sm px-3 py-2 border rounded-lg focus:outline-none resize-none bg-white font-mono', t.textareaBorder]"
        @input="emit('update:editingValue', ($event.target as HTMLTextAreaElement).value)"
        @blur="emit('save')"
        @keydown.escape="emit('cancel-edit')"
      />
      <p class="text-[10px] text-gray-400 mt-1">Každý řádek = položka. Formát se automaticky převede na checklist.</p>
    </div>
    <div v-else :class="['rounded-lg p-3 min-h-[3rem]', t.box]">
      <div v-if="content" class="space-y-1">
        <label
          v-for="item in lines"
          :key="item.lineIndex"
          :class="[
            'flex items-start gap-2 py-0.5 rounded transition-all duration-200 group',
            canEdit ? ['cursor-pointer', t.hoverItem] : 'cursor-default',
            togglingLineIndex === item.lineIndex ? 'opacity-50' : '',
          ]"
          @click.prevent="canEdit && emit('toggle-line', item.lineIndex)"
        >
          <span :class="['flex-shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center text-[10px] transition-all duration-200', item.checked ? t.checkOn : t.checkOff]">
            <span v-if="item.checked">✓</span>
          </span>
          <span :class="['text-sm leading-snug transition-all duration-200', item.checked ? 'line-through text-gray-400' : 'text-gray-700']">{{ item.text }}</span>
        </label>
      </div>
      <p v-else class="text-xs text-gray-400 italic cursor-pointer" @click="canEdit && emit('start-edit')">Klikněte pro přidání...</p>
    </div>
  </div>
</template>
