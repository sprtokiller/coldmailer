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
  prefilledCc?: string
  prefilledSubject?: string
  inReplyToGmailId?: string
  editScheduled?: EditScheduled | null
  hasPriorCommunication?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: []; sent: [] }>()

const { activeProject, groupFont } = useActiveProject()
const toast = useToast()

const isEdit = computed(() => !!props.editScheduled)

const to = ref(props.editScheduled?.toAddress ?? props.prefilledTo ?? '')
const cc = ref(props.editScheduled?.cc ?? props.prefilledCc ?? '')
const bcc = ref(props.editScheduled?.bcc ?? '')
const showCc = ref(!!cc.value)
const showBcc = ref(!!bcc.value)
const subject = ref(props.editScheduled?.subject ?? props.prefilledSubject ?? '')
const body = ref(props.editScheduled?.body ?? '')
const selectedSignatureId = ref('')
const includeSignature = ref(true)
const sending = ref(false)
const error = ref('')

function dateToDatetimeLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toDatetimeLocal(iso: string): string {
  return dateToDatetimeLocal(new Date(iso))
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const scheduledFor = ref(props.editScheduled ? toDatetimeLocal(props.editScheduled.scheduledFor) : '')

// Default: at least 15 minutes from now, rounded up to the nearest half hour
function defaultScheduleTime(): Date {
  const d = new Date(Date.now() + 15 * 60 * 1000)
  const remainder = d.getMinutes() % 30
  if (remainder !== 0) d.setMinutes(d.getMinutes() + (30 - remainder))
  d.setSeconds(0, 0)
  return d
}

const schedulePopoverOpen = ref(false)
const schedulePopoverView = ref<'menu' | 'picker'>('menu')

function toggleSchedulePopover() {
  if (schedulePopoverOpen.value) {
    closeSchedulePopover()
  } else {
    schedulePopoverOpen.value = true
    schedulePopoverView.value = 'menu'
  }
}

function closeSchedulePopover() {
  schedulePopoverOpen.value = false
  schedulePopoverView.value = 'menu'
}

function openSchedulePicker() {
  schedulePopoverView.value = 'picker'
  if (!scheduledFor.value) scheduledFor.value = dateToDatetimeLocal(defaultScheduleTime())
}

function pickIn30Min() {
  const d = new Date(Date.now() + 30 * 60 * 1000)
  d.setSeconds(0, 0)
  scheduledFor.value = dateToDatetimeLocal(d)
}

function pickNextMonday() {
  const d = new Date()
  d.setHours(8, 0, 0, 0)
  let daysUntilMonday = (1 - d.getDay() + 7) % 7
  if (daysUntilMonday === 0 && d.getTime() <= Date.now()) daysUntilMonday = 7
  d.setDate(d.getDate() + daysUntilMonday)
  scheduledFor.value = dateToDatetimeLocal(d)
}

function pickTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(7, 0, 0, 0)
  scheduledFor.value = dateToDatetimeLocal(d)
}

onMounted(() => {
  document.addEventListener('click', closeSchedulePopover)
})
onUnmounted(() => {
  document.removeEventListener('click', closeSchedulePopover)
})

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
const scheduleValid = computed(() => !!scheduledForDate.value && scheduledForDate.value.getTime() > Date.now())

const signatureRequired = computed(() => !isEdit.value && !props.hasPriorCommunication)

watch(signatureRequired, (val) => { if (val) includeSignature.value = true }, { immediate: true })

const baseValid = computed(() =>
  !!to.value.trim() && !!subject.value.trim() && !!body.value.trim() &&
  (isEdit.value || !signatureRequired.value || (includeSignature.value && !!selectedSignatureId.value)) &&
  !sending.value,
)

// Immediate "Odeslat" / "Uložit změny" — for edit mode the schedule time must stay valid too
const canSend = computed(() => baseValid.value && (!isEdit.value || scheduleValid.value))
// Confirming a chosen time in the schedule popover
const canConfirmSchedule = computed(() => baseValid.value && scheduleValid.value)

const submitLabel = computed(() => isEdit.value ? 'Uložit změny' : 'Odeslat')

async function submitEmail(scheduled: boolean) {
  const requiresValidTime = isEdit.value || scheduled
  if (requiresValidTime ? !canConfirmSchedule.value : !canSend.value) return
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
      const sig = includeSignature.value ? signatures.value.find(s => s.id === selectedSignatureId.value) : undefined
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
          scheduledFor: scheduled ? scheduledForDate.value!.toISOString() : undefined,
        },
      })
      if (scheduled) {
        toast.show(`E-mail bude odeslán ${fmtDateTime(scheduledForDate.value!)}`, 'success')
      }
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
              data-bwignore
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
              data-bwignore
              list="composer-contacts-list"
              class="composer-field-input"
              placeholder="Emailové adresy, odděl čárkou…"
            />
            <button type="button" class="composer-cc-toggle" @click="showBcc = false; bcc = ''">✕</button>
          </div>
          <div class="composer-field-row">
            <span class="composer-field-label">Předmět</span>
            <input v-model="subject" type="text" autocomplete="off" data-bwignore class="composer-field-input" placeholder="Předmět e-mailu…" />
          </div>
          <template v-if="!isEdit">
            <div class="composer-field-row">
              <span class="composer-field-label">Podpis</span>
              <label class="composer-checkbox" :class="{ 'composer-checkbox--disabled': signatureRequired }">
                <input v-model="includeSignature" type="checkbox" :disabled="signatureRequired" />
                Zahrnout podpis
              </label>
              <span v-if="signatureRequired" class="composer-required-hint">povinné při oslovování</span>
            </div>
            <div v-if="includeSignature" class="composer-field-row">
              <span class="composer-field-label"></span>
              <select v-if="signatures.length" v-model="selectedSignatureId" class="composer-field-input composer-field-select">
                <option value="">— vyberte —</option>
                <option v-for="sig in signatures" :key="sig.id" :value="sig.id">{{ sig.name }}</option>
              </select>
              <span v-else class="composer-no-signature">Nemáte podpis pro tento typ projektu — vytvořte jej v Knihovně.</span>
            </div>
          </template>

          <!-- Scheduling (edit mode only — new e-mails use the "Odeslat později" popover in the footer) -->
          <div v-if="isEdit" class="composer-field-row">
            <span class="composer-field-label">Naplánováno</span>
            <input
              v-model="scheduledFor"
              type="datetime-local"
              class="composer-field-input"
              :class="{ 'composer-field-input--error': scheduledFor && !scheduleValid }"
            />
          </div>
        </div>

        <!-- Editor -->
        <div class="composer-editor">
          <RichTextEditor v-model="body" placeholder="Napište zprávu…" :default-font="groupFont" class="composer-rte" />
        </div>

        <!-- Error -->
        <div v-if="error" class="composer-error">{{ error }}</div>

        <!-- Footer -->
        <div class="composer-footer">
          <button class="composer-btn-secondary" :disabled="sending" @click="emit('close')">Zrušit</button>

          <button v-if="isEdit" class="composer-btn-primary" :disabled="!canSend" @click="submitEmail(false)">
            <svg v-if="sending" class="composer-spinner" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ sending ? 'Ukládám…' : submitLabel }}
          </button>

          <div v-else class="composer-split-btn">
            <button class="composer-split-btn-main" :disabled="!canSend" @click="submitEmail(false)">
              <svg v-if="sending" class="composer-spinner" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {{ sending ? 'Odesílám…' : submitLabel }}
            </button>
            <button
              type="button"
              class="composer-split-btn-arrow"
              :disabled="!baseValid"
              title="Odeslat později"
              @click.stop="toggleSchedulePopover"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
            </button>

            <div v-if="schedulePopoverOpen" class="composer-schedule-popover" @click.stop>
              <button v-if="schedulePopoverView === 'menu'" type="button" class="composer-schedule-menu-item" @click="openSchedulePicker">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 3" /></svg>
                Odeslat později
              </button>

              <template v-else>
                <div class="composer-schedule-quick">
                  <button type="button" @click="pickIn30Min">Za 30 min</button>
                  <button type="button" @click="pickNextMonday">Pondělí 8:00</button>
                  <button type="button" @click="pickTomorrow">Zítra 7:00</button>
                </div>
                <input
                  v-model="scheduledFor"
                  type="datetime-local"
                  class="composer-field-input"
                  :class="{ 'composer-field-input--error': scheduledFor && !scheduleValid }"
                />
                <div class="composer-schedule-actions">
                  <button type="button" class="composer-btn-secondary" @click="closeSchedulePopover">Zrušit</button>
                  <button type="button" class="composer-btn-primary" :disabled="!canConfirmSchedule" @click="submitEmail(true)">Odeslat</button>
                </div>
              </template>
            </div>
          </div>
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
  width: 92%;
  max-width: 1500px;
  height: calc(100vh - 96px);
  max-height: calc(100vh - 96px);
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

.composer-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}

.composer-checkbox input {
  cursor: pointer;
}

.composer-checkbox--disabled {
  color: #9ca3af;
  cursor: not-allowed;
}

.composer-checkbox--disabled input {
  cursor: not-allowed;
}

.composer-required-hint {
  font-size: 11px;
  color: #b45309;
  font-weight: 600;
}

.composer-split-btn {
  position: relative;
  display: flex;
}

.composer-split-btn-main,
.composer-split-btn-arrow {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  transition: opacity 0.12s, transform 0.12s;
}

.composer-split-btn-main:hover:not(:disabled),
.composer-split-btn-arrow:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.composer-split-btn-main:active:not(:disabled),
.composer-split-btn-arrow:active:not(:disabled) {
  transform: translateY(0);
}

.composer-split-btn-main:disabled,
.composer-split-btn-arrow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-split-btn-main {
  padding: 7px 16px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.composer-split-btn-arrow {
  padding: 7px 10px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}

.composer-schedule-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  padding: 10px;
  z-index: 20;
}

.composer-schedule-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.15s;
}

.composer-schedule-menu-item:hover { background: #f3f4f6; }

.composer-schedule-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.composer-schedule-quick button {
  flex: 1 1 auto;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.composer-schedule-quick button:hover { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }

.composer-schedule-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
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
  display: flex;
  overflow: hidden;
}

:deep(.composer-rte) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.composer-rte > .bg-white) {
  flex: 1;
  min-height: 0;
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
