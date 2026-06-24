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
  const savedTo = emailMatch?.savedAt ? String(emailMatch.to ?? '') : ''
  const key = normalizeKey(name)
  const profiles = pipeline.profilingOutputProfiles('PARTNER_PROFILING') as Array<Record<string, unknown>>
  const profile = profiles.find(p => normalizeKey(p.name) === key)
  if (savedTo) {
    emailTo.value = savedTo
  } else if (profile) {
    const contacts = profile.contacts as Array<{ email?: string; priority?: number }> | undefined
    if (Array.isArray(contacts)) {
      const withEmail = contacts
        .filter(c => c.email)
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      if (withEmail.length > 0) {
        selectedContactIdx.value = 0
        emailTo.value = withEmail[0].email!
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

const sendNotifications = useSendNotifications()

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

  try {
    const cfg = pipeline.getConfig('OUTREACH_PREPARATION')
    const partnerName = selectedPartner.value
    const pipelineId = String(pipeline.route.params.id)
    const res = await $fetch<{ scheduledId: string; gracePeriodMs: number }>(`/api/pipeline/${pipelineId}/outreach/schedule-send`, {
      method: 'POST',
      body: {
        partnerName,
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
    const notifId = res.scheduledId
    sendNotifications.add({
      id: notifId,
      partnerName,
      scheduledId: res.scheduledId,
      pipelineId,
      gracePeriodMs: res.gracePeriodMs ?? 20_000,
    })
    await pipeline.refresh()
    pollForSendResult(res.gracePeriodMs ?? 20_000, notifId, partnerName)
  } catch (err) {
    alert(`Nepodařilo se naplánovat odeslání: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    saving.value = false
  }
}

function pollForSendResult(gracePeriodMs: number, notifId: string, partnerName: string) {
  let attempts = 0
  const maxAttempts = 6
  let timer: ReturnType<typeof setTimeout> | null = null
  const check = async () => {
    attempts++
    await pipeline.refresh()
    const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
    const match = emails.find(e => String(e.partnerName ?? e.name ?? '') === partnerName)
    if (match?.sentAt) {
      sendNotifications.markSent(notifId)
      return
    }
    if (match?.sendError) {
      sendNotifications.markError(notifId, String(match.sendError))
      return
    }
    if (attempts < maxAttempts) {
      timer = setTimeout(check, 5000)
    }
  }
  timer = setTimeout(check, gracePeriodMs + 3000)
}

provide(outreachActionsKey, {
  saving,
  handleSaveAndClose,
  handleSaveAndSend,
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

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.workspace-enter-active, .workspace-leave-active { transition: opacity 0.15s ease; }
.workspace-enter-from, .workspace-leave-to { opacity: 0; }
</style>
