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
  canEdit: boolean
  returningToOutreach: boolean
}>()

const emit = defineEmits<{
  toggle: [EmailItem]
  reply: [EmailItem]
  'reply-all': [EmailItem]
  delete: [EmailItem]
  'return-to-outreach': []
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

  <div v-if="!props.emails.length" class="flex flex-col items-center gap-3 py-16 text-center">
    <p class="text-gray-300 text-sm select-none">Žádná komunikace neprobíhá</p>
    <button
      v-if="props.canEdit"
      type="button"
      :disabled="props.returningToOutreach"
      class="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
      @click="emit('return-to-outreach')"
    >
      {{ props.returningToOutreach ? 'Vracím...' : 'Vrátit se k oslovení' }}
    </button>
  </div>
</template>
