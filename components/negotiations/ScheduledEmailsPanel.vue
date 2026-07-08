<script setup lang="ts">
interface AppUser { id: string; name: string; image: string | null; email: string }
interface ScheduledEmailItem {
  id: string
  toAddress: string
  cc: string | null
  bcc: string | null
  subject: string
  body: string
  scheduledFor: string | null
  status: 'PENDING' | 'SENDING' | 'FAILED'
  errorMessage: string | null
  createdBy: AppUser
  source?: 'app' | 'gmail'
}

defineProps<{
  scheduledEmails: ScheduledEmailItem[]
  canEdit: boolean
  actionLoading: string | null
}>()

const emit = defineEmits<{
  edit: [ScheduledEmailItem]
  'send-now': [ScheduledEmailItem]
  cancel: [ScheduledEmailItem]
}>()

function fmtScheduled(iso: string) {
  return new Date(iso).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div
    v-for="se in scheduledEmails"
    :key="se.id"
    class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3"
  >
    <div class="min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span v-if="se.source === 'gmail'" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 uppercase tracking-wide">
          Naplánováno v Gmailu
        </span>
        <span v-else class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 uppercase tracking-wide">
          {{ se.status === 'FAILED' ? 'Selhalo' : se.status === 'SENDING' ? 'Odesílá se…' : 'Naplánováno' }}
        </span>
        <span class="text-sm font-medium text-amber-900">{{ se.subject }}</span>
      </div>
      <p v-if="se.source === 'gmail'" class="text-xs text-amber-700 mt-1">
        Komu: <span class="font-mono">{{ se.toAddress }}</span> · čas odeslání zná jen Gmail · připraveno bokem uživatelem {{ se.createdBy.name }}
      </p>
      <p v-else class="text-xs text-amber-700 mt-1">
        Komu: <span class="font-mono">{{ se.toAddress }}</span> · odejde
        <strong>{{ fmtScheduled(se.scheduledFor!) }}</strong> · připravil/a {{ se.createdBy.name }}
      </p>
      <p v-if="se.status === 'FAILED' && se.errorMessage" class="text-xs text-red-600 mt-1">{{ se.errorMessage }}</p>
    </div>
    <div v-if="se.source === 'gmail'" class="flex items-center gap-2 flex-shrink-0">
      <a
        href="https://mail.google.com/mail/u/0/#scheduled"
        target="_blank"
        rel="noopener"
        class="text-xs px-2.5 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
      >Otevřít v Gmailu</a>
    </div>
    <div v-else-if="(se.status === 'PENDING' || se.status === 'FAILED') && canEdit" class="flex items-center gap-2 flex-shrink-0">
      <button
        v-if="se.status === 'PENDING'"
        :disabled="actionLoading === se.id"
        class="text-xs px-2.5 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors"
        @click="emit('edit', se)"
      >Upravit</button>
      <button
        :disabled="actionLoading === se.id"
        class="text-xs px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        @click="emit('send-now', se)"
      >{{ se.status === 'FAILED' ? 'Zkusit znovu' : 'Odeslat nyní' }}</button>
      <button
        :disabled="actionLoading === se.id"
        class="text-xs px-2.5 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        @click="emit('cancel', se)"
      >{{ se.status === 'FAILED' ? 'Zavřít' : 'Zrušit' }}</button>
    </div>
  </div>
</template>
