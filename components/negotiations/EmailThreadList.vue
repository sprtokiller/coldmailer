<script setup lang="ts">
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
  fromAddress: string | null
  toAddress: string | null
  ccAddress: string | null
  bccAddress: string | null
  gmailId: string | null
  threadId: string | null
  canEdit: boolean
  isUnknownContact: boolean
  unknownContactAddress: string | null
  isRead: boolean
}

const props = defineProps<{
  emails: EmailItem[] // newest-first
  expandedEvents: Set<string>
  emailDisplayMode: string
}>()

const emit = defineEmits<{
  toggle: [EmailItem]
  reply: [EmailItem]
  'reply-all': [EmailItem]
  delete: [EmailItem]
}>()

const emailsRef = computed(() => props.emails)
const rows = useEmailThreadRows(emailsRef)
</script>

<template>
  <!-- Emails: flat, newest-first, all at the same level — a colored rail connects
       messages that share a thread so a conversation stays traceable even when
       another thread's messages are interleaved in between. -->
  <div v-for="row in rows" :key="row.email.id" class="flex items-stretch gap-1">
    <div class="flex shrink-0" :style="{ width: `${row.laneCount * 14}px` }">
      <div v-for="n in row.laneCount" :key="n" class="relative w-3.5 shrink-0">
        <template v-for="mark in row.laneMarks" :key="mark.lane">
          <template v-if="mark.lane === n - 1">
            <div v-if="!mark.isOwn" class="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2" :class="mark.color.line" />
            <template v-else>
              <div v-if="row.hasLineAbove" class="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2" :class="mark.color.line" />
              <div v-if="row.hasLineBelow" class="absolute left-1/2 bottom-0 h-1/2 w-px -translate-x-1/2" :class="mark.color.line" />
              <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full ring-2 ring-white" :class="mark.color.dot" />
            </template>
          </template>
        </template>
      </div>
    </div>
    <svg
      v-if="row.lane !== -1"
      class="w-2 h-2 shrink-0 self-center"
      viewBox="0 0 8 8"
      fill="currentColor"
      :class="row.laneMarks.find(m => m.isOwn)?.color.text"
    >
      <path d="M0 0l8 4-8 4z" />
    </svg>
    <div class="flex-1 min-w-0">
      <NegotiationsEmailInteractionCard
        :email="row.email"
        :expanded="expandedEvents.has(row.email.id)"
        :email-display-mode="emailDisplayMode"
        @toggle="emit('toggle', row.email)"
        @reply="emit('reply', row.email)"
        @reply-all="emit('reply-all', row.email)"
        @delete="emit('delete', row.email)"
      />
    </div>
  </div>

  <p v-if="!rows.length" class="text-center py-16 text-gray-300 text-sm select-none">
    Žádná jednání tohoto typu
  </p>
</template>
