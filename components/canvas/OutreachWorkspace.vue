<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import { STEP_MODEL, MODEL_BADGE } from '~/config/pipeline'
import { outreachWorkspaceKey, outreachActionsKey } from '~/composables/canvas/useOutreachWorkspace'
import { normalizeKey } from '~/composables/pipeline/useSelectionState'

const canvas = inject(canvasKey)!
const pipeline = inject(pipelineRunKey) as PipelineRunContext

const isOpen = computed(() => canvas.activeOverlayNode.value?.stepType === 'OUTREACH_PREPARATION')

const modelBadge = computed(() => {
  const model = STEP_MODEL['OUTREACH_PREPARATION']
  return model ? MODEL_BADGE[model] ?? null : null
})

// Workspace-local state
const hiddenPartners = ref<Set<string>>(new Set())
const partnerSearch = ref('')
const selectedPartner = ref<string | null>(null)
const emailBody = ref('')
const emailSubject = ref('')
const emailTo = ref('')
const selectedArgumentIds = ref<Set<string>>(new Set())
const selectedContactIdx = ref<number | null>(null)

provide(outreachWorkspaceKey, {
  hiddenPartners,
  partnerSearch,
  selectedPartner,
  emailBody,
  emailSubject,
  emailTo,
  selectedArgumentIds,
  selectedContactIdx,
})

// Sync the selected partner into step5SelectedIds so executeStep works
watch(selectedPartner, (name) => {
  if (!pipeline) return
  const ids = pipeline.step5SelectedIds
  for (const key of Object.keys(ids)) {
    ids[key] = false
  }
  if (name) {
    ids[name] = true
  }
})

watch(isOpen, (val) => {
  if (val && pipeline) {
    pipeline.initStep5Selection()
  }
})

watch(selectedPartner, (name) => {
  selectedContactIdx.value = null
  selectedArgumentIds.value = new Set()
  const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
  const emailMatch = emails.find(e => String(e.partnerName ?? e.name ?? '') === name)
  emailBody.value = emailMatch ? String(emailMatch.body ?? emailMatch.emailBody ?? '') : ''
  emailSubject.value = emailMatch ? String(emailMatch.subject ?? '') : ''
  if (!name) return
  const alignments = pipeline.alignmentOutputAlignments('VALUE_ALIGNMENT') as Array<Record<string, unknown>>
  const match = alignments.find(a => String(a.name ?? a.partnerName ?? '') === name)
  if (!match) return
  const top3 = match.top3Arguments as Array<Record<string, unknown>> | undefined
  if (Array.isArray(top3) && top3.length > 0) {
    selectedArgumentIds.value = new Set([String(top3[0].argumentId ?? '')])
  }
  const key = normalizeKey(name)
  const profiles = pipeline.profilingOutputProfiles('PARTNER_PROFILING') as Array<Record<string, unknown>>
  const profile = profiles.find(p => normalizeKey(p.name) === key)
  if (profile) {
    const contacts = profile.contacts as Array<{ email?: string; priority?: number }> | undefined
    if (Array.isArray(contacts)) {
      const withEmail = contacts
        .map((c, i) => ({ ...c, _origIdx: i }))
        .filter(c => c.email)
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      if (withEmail.length > 0) {
        selectedContactIdx.value = 0
        emailTo.value = withEmail[0].email!
      } else {
        emailTo.value = ''
      }
    }
  }
  if (!emailTo.value && emailMatch) {
    emailTo.value = String(emailMatch.to ?? '')
  }
})

watch(selectedContactIdx, (idx) => {
  if (idx == null || !selectedPartner.value) return
  const key = normalizeKey(selectedPartner.value)
  const profiles = pipeline.profilingOutputProfiles('PARTNER_PROFILING') as Array<Record<string, unknown>>
  const profile = profiles.find(p => normalizeKey(p.name) === key)
  if (!profile) return
  const contacts = profile.contacts as Array<{ email?: string; priority?: number }> | undefined
  if (!Array.isArray(contacts)) return
  const withEmail = contacts
    .filter(c => c.email)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  if (withEmail[idx]) {
    emailTo.value = withEmail[idx].email!
  }
})

// ── Save & Send (server-side scheduled) ──────────────────────────────────────

const saving = ref(false)
const sendToastVisible = ref(false)
const sendToastSent = ref(false)
const sendToastError = ref('')
const _scheduledId = ref<string | null>(null)
let _pollTimer: ReturnType<typeof setTimeout> | null = null

function getSelectedSignatureContent(): string | undefined {
  const cfg = pipeline.getConfig('OUTREACH_PREPARATION')
  const sigId = (cfg as any)._selectedSignatureId as string | undefined
  if (!sigId) return undefined
  const sig = pipeline.signatures.find((s: any) => s.id === sigId)
  return sig?.content
}

function getSelectedSignatureId(): string | undefined {
  const cfg = pipeline.getConfig('OUTREACH_PREPARATION')
  return (cfg as any)._selectedSignatureId as string | undefined
}

function getPartnerId(): string | undefined {
  if (!selectedPartner.value) return undefined
  const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
  const match = emails.find(e => String(e.partnerName ?? e.name ?? '') === selectedPartner.value)
  return match?.partnerId as string | undefined
}

async function doSave() {
  if (!selectedPartner.value) return
  saving.value = true
  try {
    const cfg = pipeline.getConfig('OUTREACH_PREPARATION')
    await $fetch(`/api/pipeline/${pipeline.route.params.id}/outreach/save`, {
      method: 'POST',
      body: {
        partnerName: selectedPartner.value,
        partnerId: getPartnerId(),
        to: emailTo.value,
        subject: emailSubject.value,
        body: emailBody.value,
        config: {
          systemPromptId: cfg.systemPromptId,
          contextPartIds: cfg.contextPartIds,
          emailDraftId: cfg.emailDraftId,
          signatureId: getSelectedSignatureId(),
          selectedArgumentIds: Array.from(selectedArgumentIds.value),
        },
      },
    })
    await pipeline.refresh()
  } finally {
    saving.value = false
  }
}

async function handleSaveAndClose() {
  await doSave()
  selectedPartner.value = null
}

async function handleSaveAndSend() {
  if (!selectedPartner.value || !emailTo.value) return
  saving.value = true
  sendToastVisible.value = false
  sendToastSent.value = false

  try {
    const cfg = pipeline.getConfig('OUTREACH_PREPARATION')
    const res = await $fetch<{ scheduledId: string; gracePeriodMs: number }>(`/api/pipeline/${pipeline.route.params.id}/outreach/schedule-send`, {
      method: 'POST',
      body: {
        partnerName: selectedPartner.value,
        partnerId: getPartnerId(),
        to: emailTo.value,
        subject: emailSubject.value,
        body: emailBody.value,
        signatureContent: getSelectedSignatureContent(),
        config: {
          systemPromptId: cfg.systemPromptId,
          contextPartIds: cfg.contextPartIds,
          emailDraftId: cfg.emailDraftId,
          signatureId: getSelectedSignatureId(),
          selectedArgumentIds: Array.from(selectedArgumentIds.value),
        },
      },
    })
    _scheduledId.value = res.scheduledId
    sendToastVisible.value = true
    sendToastError.value = ''
    await pipeline.refresh()
    pollForSendResult(res.gracePeriodMs ?? 20_000)
  } catch (err) {
    alert(`Nepodařilo se naplánovat odeslání: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    saving.value = false
  }
}

function pollForSendResult(gracePeriodMs: number) {
  if (_pollTimer) clearTimeout(_pollTimer)
  const partnerName = selectedPartner.value
  let attempts = 0
  const maxAttempts = 6
  const check = async () => {
    attempts++
    await pipeline.refresh()
    const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
    const match = emails.find(e => String(e.partnerName ?? e.name ?? '') === partnerName)
    if (match?.sentAt) {
      sendToastSent.value = true
      _scheduledId.value = null
      _pollTimer = null
      setTimeout(() => { sendToastVisible.value = false }, 4000)
      return
    }
    if (match?.sendError) {
      sendToastError.value = String(match.sendError)
      sendToastVisible.value = false
      _scheduledId.value = null
      _pollTimer = null
      return
    }
    if (attempts < maxAttempts) {
      _pollTimer = setTimeout(check, 5000)
    } else {
      _pollTimer = null
    }
  }
  _pollTimer = setTimeout(check, gracePeriodMs + 3000)
}

async function cancelSend() {
  if (!_scheduledId.value) return
  if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null }
  try {
    await $fetch(`/api/pipeline/${pipeline.route.params.id}/outreach/cancel-send`, {
      method: 'POST',
      body: { scheduledId: _scheduledId.value },
    })
  } catch { /* best effort */ }
  _scheduledId.value = null
  sendToastVisible.value = false
  sendToastSent.value = false
}

provide(outreachActionsKey, {
  saving,
  sendToastVisible,
  sendToastSent,
  sendToastError,
  handleSaveAndClose,
  handleSaveAndSend,
  cancelSend,
})
</script>

<template>
  <Transition name="workspace">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      @click.self="canvas.closeOverlay()"
    >
      <div class="w-[92vw] h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden relative">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <h2 class="text-sm font-semibold text-gray-800">Příprava oslovení</h2>
            <span
              v-if="modelBadge"
              :class="['text-xs px-2 py-0.5 rounded-full font-medium shrink-0', modelBadge.cls]"
            >{{ modelBadge.label }}</span>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 transition-colors ml-4 shrink-0"
            @click="canvas.closeOverlay()"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body: three columns -->
        <div class="flex-1 flex overflow-hidden min-h-0">
          <!-- Left: partner list -->
          <div class="w-72 border-r border-gray-100 flex flex-col shrink-0">
            <CanvasOutreachPartnerList />
          </div>

          <!-- Middle: partner detail -->
          <div class="w-80 border-r border-gray-100 shrink-0 flex flex-col overflow-hidden">
            <CanvasOutreachPartnerDetail />
          </div>

          <!-- Right: config + editor -->
          <div class="flex-1 flex flex-col min-w-0">
            <CanvasOutreachWorkspaceConfig />
          </div>
        </div>

        <!-- Toast: send pending / sent / error -->
        <Transition name="toast">
          <div
            v-if="sendToastVisible"
            class="absolute bottom-4 right-4 z-50 rounded-xl shadow-xl border px-4 py-3 flex items-center gap-3 text-sm"
            :class="sendToastSent
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-white border-gray-200 text-gray-800'"
          >
            <template v-if="!sendToastSent">
              <svg class="w-4 h-4 text-primary animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>E-mail bude brzy odeslán</span>
              <button
                class="ml-2 text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 transition-colors"
                @click="cancelSend"
              >
                Zrušit odeslání
              </button>
            </template>
            <template v-else>
              <svg class="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Odesláno</span>
            </template>
          </div>
        </Transition>
        <Transition name="toast">
          <div
            v-if="sendToastError"
            class="absolute bottom-4 right-4 z-50 rounded-xl shadow-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 flex items-center gap-3 text-sm"
          >
            <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="truncate max-w-xs">Odeslání selhalo: {{ sendToastError }}</span>
            <button class="text-xs font-medium underline shrink-0" @click="sendToastError = ''">Zavřít</button>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.workspace-enter-active, .workspace-leave-active { transition: opacity 0.15s ease; }
.workspace-enter-from, .workspace-leave-to { opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
