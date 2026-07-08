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
  isCalendarBooking: boolean
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
</script>

<template>
  <div v-for="email in props.emails" :key="email.id">
    <NegotiationsEmailInteractionCard
      :email="email"
      :expanded="expandedEvents.has(email.id)"
      :email-display-mode="emailDisplayMode"
      @toggle="emit('toggle', email)"
      @reply="emit('reply', email)"
      @reply-all="emit('reply-all', email)"
      @delete="emit('delete', email)"
    />
  </div>

  <p v-if="!props.emails.length" class="text-center py-16 text-gray-300 text-sm select-none">
    Žádná jednání tohoto typu
  </p>
</template>
