<script setup lang="ts">
interface Contact {
  id: string
  address: string
  firstName: string | null
  lastName: string | null
}

interface SigItem {
  id: string
  name: string
  content: string
  groupId?: string | null
}

interface EditScheduled {
  id: string
  toAddress: string
  cc: string | null
  bcc: string | null
  subject: string
  body: string
  scheduledFor: string
}

interface Props {
  globalRecordId: string
  contacts: Contact[]
  prefilledTo?: string
  prefilledSubject?: string
  inReplyToGmailId?: string
  editScheduled?: EditScheduled | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: []; sent: [] }>()

const { activeProject, groupFont } = useActiveProject()

const isEdit = computed(() => !!props.editScheduled)

const to = ref(props.editScheduled?.toAddress ?? props.prefilledTo ?? '')
const cc = ref(props.editScheduled?.cc ?? '')
const bcc = ref(props.editScheduled?.bcc ?? '')
const showCc = ref(!!cc.value)
const showBcc = ref(!!bcc.value)
const subject = ref(props.editScheduled?.subject ?? props.prefilledSubject ?? '')
const body = ref(props.editScheduled?.body ?? '')
const selectedSignatureId = ref('')
const sending = ref(false)
const error = ref('')

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const scheduleEnabled = ref(!!props.editScheduled)
const scheduledFor = ref(props.editScheduled ? toDatetimeLocal(props.editScheduled.scheduledFor) : '')

const activeProjectId = computed(() => activeProject.value?.id ?? '')

const { data: sigsData } = useFetch('/api/library/signatures', {
  query: { projectId: activeProjectId },
})

const signatures = computed<SigItem[]>(() => {
  const d = sigsData.value as { templates?: SigItem[]; personal?: SigItem[] } | null
  if (!d) return []
  return d.personal ?? []
})

watch(signatures, (val) => {
  if (!isEdit.value && !selectedSignatureId.value && val.length > 0) selectedSignatureId.value = val[0].id
}, { immediate: true })

const title = computed(() => isEdit.value ? 'Upravit naplánovaný e-mail' : props.inReplyToGmailId ? 'Odpovědět' : 'Nový e-mail')

const scheduledForDate = computed(() => scheduledFor.value ? new Date(scheduledFor.value) : null)
const scheduleValid = computed(() => !scheduleEnabled.value || (!!scheduledForDate.value && scheduledForDate.value.getTime() > Date.now()))

const canSend = computed(() =>
  !!to.value.trim() && !!subject.value.trim() && !!body.value.trim() &&
  (isEdit.value || !!selectedSignatureId.value) &&
  scheduleValid.value && !sending.value,
)

const submitLabel = computed(() => {
  if (isEdit.value) return 'Uložit změny'
  return scheduleEnabled.value ? 'Naplánovat odeslání' : 'Odeslat'
})

async function handleSend() {
  if (!canSend.value) return
  error.value = ''
  sending.value = true
  try {
    if (isEdit.value) {
      const scheduledForChanged = scheduledFor.value !== toDatetimeLocal(props.editScheduled!.scheduledFor)
      await $fetch(`/api/partners/${props.globalRecordId}/scheduled-emails/${props.editScheduled!.id}`, {
        method: 'PATCH',
        body: {
          toAddress: to.value.trim(),
          cc: cc.value.trim(),
          bcc: bcc.value.trim(),
          subject: subject.value.trim(),
          body: body.value,
          ...(scheduledForChanged ? { scheduledFor: scheduledForDate.value!.toISOString() } : {}),
        },
      })
    } else {
      const sig = signatures.value.find(s => s.id === selectedSignatureId.value)
      await $fetch(`/api/partners/${props.globalRecordId}/send-email`, {
        method: 'POST',
        body: {
          toAddress: to.value.trim(),
          cc: cc.value.trim() || undefined,
          bcc: bcc.value.trim() || undefined,
          subject: subject.value.trim(),
          body: body.value,
          signatureContent: sig?.content,
          inReplyToGmailId: props.inReplyToGmailId,
          scheduledFor: scheduleEnabled.value ? scheduledForDate.value!.toISOString() : undefined,
        },
      })
    }
    emit('sent')
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="composer-backdrop" @click.self="emit('close')">
      <div class="composer-panel">
        <!-- Header -->
        <div class="composer-header">
          <h2 class="composer-title">{{ title }}</h2>
          <button class="composer-close" :disabled="sending" @click="emit('close')">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Fields -->
        <div class="composer-fields">
          <div class="composer-field-row">
            <span class="composer-field-label">Komu</span>
            <input
              v-model="to"
              type="text"
              autocomplete="off"
              list="composer-contacts-list"
              class="composer-field-input"
              placeholder="Emailové adresy, odděl čárkou…"
            />
            <button v-if="!showCc" type="button" class="composer-cc-toggle" @click="showCc = true">Cc</button>
            <button v-if="!showBcc" type="button" class="composer-cc-toggle" @click="showBcc = true">Bcc</button>
            <datalist id="composer-contacts-list">
              <option v-for="c in contacts" :key="c.id" :value="c.address">
                {{ [c.firstName, c.lastName].filter(Boolean).join(' ') || c.address }}
              </option>
            </datalist>
          </div>
          <div v-if="showCc" class="composer-field-row">
            <span class="composer-field-label">Cc</span>
            <input
              v-model="cc"
              type="text"
              autocomplete="off"
              list="composer-contacts-list"
              class="composer-field-input"
              placeholder="Emailové adresy, odděl čárkou…"
            />
            <button type="button" class="composer-cc-toggle" @click="showCc = false; cc = ''">✕</button>
          </div>
          <div v-if="showBcc" class="composer-field-row">
            <span class="composer-field-label">Bcc</span>
            <input
              v-model="bcc"
              type="text"
              autocomplete="off"
              list="composer-contacts-list"
              class="composer-field-input"
              placeholder="Emailové adresy, odděl čárkou…"
            />
            <button type="button" class="composer-cc-toggle" @click="showBcc = false; bcc = ''">✕</button>
          </div>
          <div class="composer-field-row">
            <span class="composer-field-label">Předmět</span>
            <input v-model="subject" type="text" class="composer-field-input" placeholder="Předmět e-mailu…" />
          </div>
          <template v-if="!isEdit">
            <div v-if="signatures.length" class="composer-field-row">
              <span class="composer-field-label">Podpis</span>
              <select v-model="selectedSignatureId" class="composer-field-input composer-field-select">
                <option v-for="sig in signatures" :key="sig.id" :value="sig.id">{{ sig.name }}</option>
              </select>
            </div>
            <div v-else class="composer-field-row">
              <span class="composer-field-label">Podpis</span>
              <span class="composer-no-signature">Nemáte podpis pro tento typ projektu — vytvořte jej v Knihovně.</span>
            </div>
          </template>

          <!-- Scheduling -->
          <div class="composer-field-row">
            <span class="composer-field-label">Naplánovat</span>
            <label v-if="!isEdit" class="composer-schedule-toggle">
              <input v-model="scheduleEnabled" type="checkbox" />
              odeslat později
            </label>
            <input
              v-if="scheduleEnabled"
              v-model="scheduledFor"
              type="datetime-local"
              class="composer-field-input"
              :class="{ 'composer-field-input--error': scheduledFor && !scheduleValid }"
            />
          </div>
        </div>

        <!-- Editor -->
        <div class="composer-editor">
          <RichTextEditor v-model="body" placeholder="Napište zprávu…" :default-font="groupFont" />
        </div>

        <!-- Error -->
        <div v-if="error" class="composer-error">{{ error }}</div>

        <!-- Footer -->
        <div class="composer-footer">
          <button class="composer-btn-secondary" :disabled="sending" @click="emit('close')">Zrušit</button>
          <button class="composer-btn-primary" :disabled="!canSend" @click="handleSend">
            <svg v-if="sending" class="composer-spinner" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ sending ? 'Odesílám…' : submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.composer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.composer-panel {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 80%;
  max-width: 1200px;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.composer-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.composer-close {
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: color 0.15s;
}

.composer-close:hover:not(:disabled) { color: #374151; }
.composer-close:disabled { opacity: 0.4; cursor: not-allowed; }

.composer-fields {
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.composer-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  width: 60px;
  flex-shrink: 0;
}

.composer-field-input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 13px;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.composer-field-input:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
}

.composer-cc-toggle {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  transition: color 0.15s;
}

.composer-cc-toggle:hover { color: #4338ca; }

.composer-no-signature {
  font-size: 12px;
  color: #dc2626;
}

.composer-schedule-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.composer-field-input--error {
  border-color: #fca5a5;
  background: #fef2f2;
}

.composer-field-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 16px;
  padding-right: 28px;
  cursor: pointer;
}

.composer-editor {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
}

.composer-error {
  margin: 0 20px 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 12px;
  color: #dc2626;
  flex-shrink: 0;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.composer-btn-secondary,
.composer-btn-primary {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}

.composer-btn-secondary:disabled,
.composer-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-btn-secondary {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
}

.composer-btn-secondary:hover:not(:disabled) { background: #f9fafb; border-color: #d1d5db; }

.composer-btn-primary {
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: #fff;
}

.composer-btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.composer-btn-primary:active:not(:disabled) { transform: translateY(0); }

.composer-spinner {
  width: 13px;
  height: 13px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
