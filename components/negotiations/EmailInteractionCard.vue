<script setup lang="ts">
import { sanitizeEmailHtml, splitQuotedHtml, splitQuotedText, htmlToText } from '~/utils/html-normalize'

interface AssigneeUser { id: string; name: string; image: string | null }
interface InteractionAssignee { userId: string; user: AssigneeUser }
interface EmailItem {
  type: 'EMAIL'
  id: string
  content: string | null
  createdAt: string
  updatedAt: string
  creator: AssigneeUser
  assignees: InteractionAssignee[]
  direction: 'SENT' | 'RECEIVED'
  subject: string | null
  sentAt: string | null
  toAddress: string | null
  canEdit: boolean
  isRead: boolean
}

const props = defineProps<{
  email: EmailItem
  expanded: boolean
  emailDisplayMode: string
}>()

const emit = defineEmits<{
  toggle: []
  reply: []
  replyAll: []
  delete: []
}>()

function handleCardClick() {
  // A click-drag text selection also fires a click on mouseup — don't let that collapse the card.
  if (window.getSelection()?.toString()) return
  emit('toggle')
}

const quotedExpanded = ref(false)

const htmlSplit = computed(() => {
  if (props.emailDisplayMode !== 'html' || !props.email.content) return { main: '', quoted: '' }
  return splitQuotedHtml(sanitizeEmailHtml(props.email.content))
})
const textSplit = computed(() => {
  if (props.emailDisplayMode !== 'text' || !props.email.content) return { main: '', quoted: '' }
  return splitQuotedText(htmlToText(props.email.content))
})

function fmtDate(d: string) {
  return new Date(d).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div
    :class="[
      'border rounded-xl p-4 transition-colors cursor-pointer',
      email.direction === 'SENT' ? 'border-blue-100' : 'border-green-100',
      !email.isRead ? 'bg-amber-50/60 ring-1 ring-amber-200' : 'bg-white',
    ]"
    @click="handleCardClick"
  >
    <!-- Header row -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
        <span :class="['text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', email.direction === 'SENT' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600']">
          {{ email.direction === 'SENT' ? '↑ Odesláno' : '↓ Obdrženo' }}
        </span>
        <img v-if="email.creator.image" :src="email.creator.image" :alt="email.creator.name" :title="email.creator.name" class="w-4 h-4 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" />
        <div v-else :title="email.creator.name" class="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ email.creator.name.charAt(0).toUpperCase() }}</div>
        <template v-for="a in email.assignees" :key="a.userId">
          <span class="text-gray-300">+</span>
          <img v-if="a.user.image" :src="a.user.image" :alt="a.user.name" :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white object-cover shrink-0" referrerpolicy="no-referrer" />
          <div v-else :title="a.user.name + ' (editoval/a)'" class="w-4 h-4 rounded-full ring-1 ring-white bg-indigo-400 flex items-center justify-center text-white text-[8px] font-medium shrink-0">{{ a.user.name.charAt(0).toUpperCase() }}</div>
        </template>
        <span class="truncate">{{ email.creator.name }}</span>
        <span class="text-gray-300 shrink-0">&middot;</span>
        <span class="text-gray-300 shrink-0">{{ fmtDate(email.sentAt ?? email.createdAt) }}</span>
        <span v-if="email.createdAt !== email.updatedAt" class="text-gray-300 shrink-0">(upraveno)</span>
      </div>
      <div v-if="email.canEdit" class="flex items-center gap-1 flex-shrink-0">
        <button title="Odpovědět" class="p-1 text-gray-300 hover:text-blue-500 transition-colors" @click.stop="emit('reply')">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button title="Odpovědět všem" class="p-1 text-gray-300 hover:text-blue-500 transition-colors" @click.stop="emit('replyAll')">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 15 5 9m0 0 6-6M5 9h9a6 6 0 0 1 0 12h-2" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 15 1 9m0 0 6-6" /></svg>
        </button>
        <button title="Smazat" class="p-1 text-gray-300 hover:text-red-400 transition-colors" @click.stop="emit('delete')">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>

    <!-- Recipients -->
    <p v-if="email.toAddress" class="text-[11px] text-gray-400 truncate mb-1" :title="email.toAddress">
      Komu: <span class="text-gray-500">{{ email.toAddress }}</span>
    </p>

    <!-- Subject -->
    <p v-if="email.subject" :class="['text-sm mb-1 flex items-center gap-1.5', email.isRead ? 'font-medium text-gray-800' : 'font-bold text-gray-900']">
      <span v-if="!email.isRead" class="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Nepřečteno" />
      {{ email.subject }}
    </p>

    <!-- Body -->
    <div v-if="expanded && email.content" class="mt-2 pt-2 border-t border-gray-100">
      <template v-if="emailDisplayMode === 'html'">
        <div class="email-html-preview text-sm text-gray-700 leading-relaxed" v-html="htmlSplit.main" />
        <div v-if="htmlSplit.quoted">
          <button class="text-xs text-gray-400 hover:text-gray-600 mt-1 transition-colors" @click.stop="quotedExpanded = !quotedExpanded">
            {{ quotedExpanded ? '▾ Skrýt citovaný text' : '••• Zobrazit citovaný text' }}
          </button>
          <div v-if="quotedExpanded" class="email-html-preview text-sm text-gray-700 leading-relaxed mt-1" v-html="htmlSplit.quoted" />
        </div>
      </template>
      <template v-else>
        <div class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{{ textSplit.main }}</div>
        <div v-if="textSplit.quoted">
          <button class="text-xs text-gray-400 hover:text-gray-600 mt-1 transition-colors" @click.stop="quotedExpanded = !quotedExpanded">
            {{ quotedExpanded ? '▾ Skrýt citovaný text' : '••• Zobrazit citovaný text' }}
          </button>
          <div v-if="quotedExpanded" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed mt-1">{{ textSplit.quoted }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.email-html-preview {
  overflow-x: auto;
  word-break: break-word;
}
.email-html-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
.email-html-preview :deep(a) {
  color: #4f46e5;
  text-decoration: underline;
}
.email-html-preview :deep(blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: #6b7280;
}
.email-html-preview :deep(p) {
  margin: 0.25rem 0;
}
.email-html-preview :deep(table) {
  max-width: 100%;
  border-collapse: collapse;
}
.email-html-preview :deep(td),
.email-html-preview :deep(th) {
  vertical-align: top;
}
.email-html-preview :deep(h1),
.email-html-preview :deep(h2),
.email-html-preview :deep(h3) {
  margin: 0.5rem 0 0.25rem;
  font-weight: 600;
}
.email-html-preview :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0.5rem 0;
}
</style>
