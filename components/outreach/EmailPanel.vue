<script setup lang="ts">
import { projectOutreachKey } from '~/composables/useProjectOutreach'
import { GROUP_FONTS } from '~/config/pipeline'

const ctx = inject(projectOutreachKey)!
const { notifications: sendNotifs, add: notifAdd, markSent: notifMarkSent, markError: notifMarkError } = useSendNotifications()

// ── State ─────────────────────────────────────────────────────────────────────
const showSenderConfirmModal = ref(false)
const emailTo = ref('')
const emailSubject = ref('')
const emailBody = ref('')
const selectedContactIdx = ref<number | null>(null)
const selectedArgumentIds = ref<Set<string>>(new Set())
const selectedSignatureId = ref('')
const saving = ref(false)
const configCollapsed = ref(false)
const recsCollapsed = ref(true)
const streamBoxEl = ref<HTMLElement | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────────
const alignment = computed(() => {
  const d = ctx.partnerDetail.value
  if (!d?.alignment) return null
  return (d.alignment as Record<string, unknown>).outputData as Record<string, unknown> | null
})

const contacts = computed(() => ctx.selectedPartner.value?.contacts ?? [])
const selectedContact = computed(() => contacts.value[selectedContactIdx.value ?? 0] ?? null)

const topArguments = computed(() => {
  const a = alignment.value
  if (!a) return []
  const t = Array.isArray(a.topArguments) ? a.topArguments : []
  return (t as Array<{ argumentId?: string; argumentLabel?: string; whyItFits?: string; rank?: number }>).filter(arg => Boolean(arg?.argumentId))
})

const opPrompts = computed(() => ctx.promptsForStep('OUTREACH_PREPARATION'))
const opDrafts = computed(() => ctx.emailDrafts.value)
const sigs = computed(() => ctx.signatures.value)
const isExecuting = computed(() => ctx.executing.value !== null)
const isExecutingHere = computed(() => ctx.executing.value !== null && ctx.executingPartnerId.value === ctx.selectedPartnerId.value)
const isExecutingElsewhere = computed(() => ctx.executing.value !== null && ctx.executingPartnerId.value !== ctx.selectedPartnerId.value)
const opContextParts = computed(() => ctx.contextParts.value.filter(cp => cp.stepKeys.includes('OUTREACH_PREPARATION')))
const selectedContextNames = computed(() => ctx.opConfig.value.contextPartIds.map(id => opContextParts.value.find(c => c.id === id)).filter(Boolean) as Array<{ id: string; name: string }>)
const contextSearch = ref('')
const showContextDropdown = ref(false)
const filteredContext = computed(() => opContextParts.value.filter(cp => !ctx.opConfig.value.contextPartIds.includes(cp.id) && cp.name.toLowerCase().includes(contextSearch.value.toLowerCase())))
function addContext(id: string) { if (!ctx.opConfig.value.contextPartIds.includes(id)) ctx.opConfig.value.contextPartIds.push(id); contextSearch.value = '' }
function removeContext(id: string) { ctx.opConfig.value.contextPartIds = ctx.opConfig.value.contextPartIds.filter(x => x !== id) }
function hideContextDropdown() { setTimeout(() => { showContextDropdown.value = false }, 150) }

const groupSlug = computed(() => '')
const defaultFont = computed(() => GROUP_FONTS[groupSlug.value] ?? '')

const hasPendingSend = computed(() =>
  sendNotifs.value.some(n => n.status === 'pending' && n.partnerName === ctx.selectedPartner.value?.canonicalName),
)

const canGenerate = computed(() => !!ctx.opConfig.value.emailDraftId || selectedArgumentIds.value.size > 0)

const draft = computed(() => {
  const d = ctx.partnerDetail.value?.draft as Record<string, unknown> | null
  return d
})

const isRegeneration = computed(() => !!draft.value)
const hasActiveCommunication = computed(() => !!ctx.partnerDetail.value?.hasActiveCommunication)
const needsConfirm = computed(() => ctx.isSubstituting.value || isRegeneration.value || hasActiveCommunication.value)
const showConfirm = ref(false)
const showCancelConfirm = ref(false)

const recommendations = computed<string[]>(() => {
  const d = draft.value
  if (!d) return []
  return Array.isArray(d.recommendations) ? d.recommendations.map(String) : []
})

// Sync form fields from stored draft when partner changes
watch(() => ctx.partnerDetail.value, (detail) => {
  const d = detail?.draft as Record<string, unknown> | null
  emailTo.value = String(d?.toAddress ?? selectedContact.value?.address ?? '')
  emailSubject.value = String(d?.subject ?? '')
  emailBody.value = String(d?.body ?? '')

  const availableIds = new Set(topArguments.value.map(a => String(a.argumentId ?? '')).filter(id => id && id !== 'undefined'))
  const savedConfig = d?.config as Record<string, unknown> | undefined
  const savedIds = Array.isArray(savedConfig?.selectedArgumentIds) ? savedConfig.selectedArgumentIds.map(String) : []
  const restored = savedIds.filter(id => availableIds.has(id))
  selectedArgumentIds.value = new Set(restored.length > 0 ? restored : availableIds)

  const hasContent = !!emailBody.value.trim()
  configCollapsed.value = hasContent
  recsCollapsed.value = !hasContent
}, { immediate: true })

watch(selectedContactIdx, () => {
  if (!emailTo.value && selectedContact.value) emailTo.value = selectedContact.value.address
})

watch(sigs, (val) => {
  if (!selectedSignatureId.value && val.length > 0) selectedSignatureId.value = val[0]?.id ?? ''
}, { immediate: true })

watch(() => ctx.streamOutput.value, async () => {
  await nextTick()
  if (streamBoxEl.value) streamBoxEl.value.scrollTop = streamBoxEl.value.scrollHeight
})

// ── Actions ───────────────────────────────────────────────────────────────────
async function generate() {
  try {
    await ctx.runDraft({
      selectedContact: selectedContact.value ?? undefined,
      selectedArgumentIds: Array.from(selectedArgumentIds.value),
    })
    const d = ctx.partnerDetail.value?.draft as Record<string, unknown> | null
    if (d) {
      emailTo.value = String(d.toAddress ?? '')
      emailSubject.value = String(d.subject ?? '')
      emailBody.value = String(d.body ?? '')
    }
    configCollapsed.value = true
    recsCollapsed.value = false
  } catch (err) { alert(`Chyba: ${err instanceof Error ? err.message : String(err)}`) }
}

function onGenerateClick() {
  if (needsConfirm.value) { showConfirm.value = true; return }
  generate()
}

function confirmAndGenerate() {
  showConfirm.value = false
  generate()
}

function onCancelClick() {
  showCancelConfirm.value = true
}

function confirmCancel() {
  showCancelConfirm.value = false
  ctx.cancelDraft()
}

async function doSave() {
  saving.value = true
  try {
    await ctx.saveDraft({
      toAddress: emailTo.value,
      subject: emailSubject.value,
      body: emailBody.value,
      config: { signatureId: selectedSignatureId.value || null, selectedArgumentIds: Array.from(selectedArgumentIds.value) },
    })
  } finally { saving.value = false }
}

const isSubstitutingSend = computed(() => {
  const draftSavedById = (draft.value as any)?.savedById as string | undefined
  const myId = ctx.currentUserId.value
  return !!(draftSavedById && myId && draftSavedById !== myId && ctx.canManageAll.value)
})
const needsSendConfirm = computed(() => isSubstitutingSend.value || hasActiveCommunication.value)

function handleSendClick() {
  if (needsSendConfirm.value) {
    showSenderConfirmModal.value = true
  } else {
    doSend()
  }
}

async function doSend() {
  showSenderConfirmModal.value = false
  saving.value = true
  try {
    const sig = sigs.value.find(s => s.id === selectedSignatureId.value)
    const res = await ctx.sendDraft({
      toAddress: emailTo.value,
      subject: emailSubject.value,
      body: emailBody.value,
      signatureContent: sig?.content,
    })
    const partnerName = ctx.selectedPartner.value?.canonicalName ?? ''
    const globalRecordId = ctx.selectedPartnerId.value ?? ''
    const projectId = ctx.projectId.value ?? ''
    notifAdd({
      id: res.scheduledId,
      partnerName,
      scheduledId: res.scheduledId,
      cancelUrl: `/api/projects/${projectId}/outreach/${globalRecordId}/cancel-send`,
      gracePeriodMs: res.gracePeriodMs,
    })
    let attempts = 0
    const check = async () => {
      attempts++
      await ctx.refreshDetail()
      const d = ctx.partnerDetail.value?.draft as Record<string, unknown> | null
      if (d?.sentAt) { notifMarkSent(res.scheduledId); return }
      if (d?.sendError) { notifMarkError(res.scheduledId, String(d.sendError)); return }
      if (attempts < 6) window.setTimeout(check, 5000)
    }
    window.setTimeout(check, res.gracePeriodMs + 3000)
  } catch (err) { alert(`Chyba při odesílání: ${err instanceof Error ? err.message : String(err)}`) } finally { saving.value = false }
}

function toggleArgument(id: string) {
  const s = new Set(selectedArgumentIds.value)
  if (s.has(id)) {
    if (s.size <= 1) return
    s.delete(id)
  } else {
    s.add(id)
  }
  selectedArgumentIds.value = s
}

function relTime(iso: string | null | undefined) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'právě teď'; if (m < 60) return `před ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `před ${h} h`; return `před ${Math.floor(h / 24)} d`
}
</script>

<template>
  <div class="panel-wrap">
    <!-- No partner -->
    <div v-if="!ctx.selectedPartnerId.value" class="panel-empty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="empty-icon">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p>Vyberte partnera<br/>ze seznamu vlevo.</p>
    </div>

    <!-- No alignment yet -->
    <div v-else-if="!alignment" class="panel-empty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="empty-icon">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>Nejprve spusťte <strong class="highlight">Value Alignment</strong><br/>pro tohoto partnera.</p>
    </div>

    <template v-else>
      <!-- ── Config header ─────────────────────────────────────── -->
      <div class="panel-config">
        <button type="button" class="section-toggle" @click="configCollapsed = !configCollapsed">
          <svg class="toggle-chevron" :class="{ 'toggle-chevron--collapsed': configCollapsed }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
          Konfigurace e-mailu
        </button>
        <div v-show="!configCollapsed" class="panel-config-body">
          <!-- Row 1 -->
          <div class="config-grid">
            <div class="field-group">
              <label class="field-label">Systémový prompt</label>
              <select v-model="ctx.opConfig.value.systemPromptId" class="field-select" :disabled="isExecutingHere">
                <option v-for="p in opPrompts" :key="p.id" :value="p.id">{{ p.isSystem ? '⚙ ' : '' }}{{ p.name }}</option>
              </select>
            </div>
            <div class="field-group">
              <label class="field-label">E-mailová šablona</label>
              <select
                v-model="ctx.opConfig.value.emailDraftId"
                class="field-select"
                :class="ctx.opConfig.value.emailDraftId ? '' : 'field-select--warn'"
                :disabled="isExecutingHere"
              >
                <option value="">— vyberte —</option>
                <option v-for="d in opDrafts" :key="d.id" :value="d.id">{{ d.name }}</option>
              </select>
            </div>
          </div>

          <!-- Row 2 -->
          <div class="config-grid">
            <div class="field-group">
              <label class="field-label">Kontakt</label>
              <select
                v-if="contacts.length"
                :value="selectedContactIdx ?? 0"
                class="field-select"
                :disabled="isExecutingHere"
                @change="selectedContactIdx = Number(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="(c, i) in contacts" :key="c.id" :value="i">
                  {{ [c.firstName, c.lastName].filter(Boolean).join(' ') || c.address }}
                </option>
              </select>
              <div v-else class="no-contact">Žádný e-mail</div>
            </div>
            <div class="field-group">
              <label class="field-label">Podpis</label>
              <select
                v-if="sigs.length > 0"
                v-model="selectedSignatureId"
                class="field-select"
                :class="selectedSignatureId ? '' : 'field-select--warn'"
                :disabled="isExecutingHere"
              >
                <option value="">— vyberte —</option>
                <option v-for="sig in sigs" :key="sig.id" :value="sig.id">{{ sig.name }}</option>
              </select>
              <div v-else class="no-sig">
                Nemáte podpis pro tento typ projektu.
                <NuxtLink to="/settings?tab=signatures" class="no-sig-link">Vytvořit v Nastavení</NuxtLink>
              </div>
            </div>
          </div>

          <!-- Row 3: arguments -->
          <div v-if="topArguments.length" class="field-group">
            <label class="field-label">Argumenty pro e-mail</label>
            <div class="arg-chips">
              <button
                v-for="arg in topArguments"
                :key="String(arg.argumentId)"
                type="button"
                class="arg-chip"
                :class="{ 'arg-chip--active': selectedArgumentIds.has(String(arg.argumentId)) }"
                :disabled="isExecutingHere"
                :title="selectedArgumentIds.size === 1 && selectedArgumentIds.has(String(arg.argumentId)) ? 'Musí zůstat vybrán alespoň jeden argument' : undefined"
                @click="toggleArgument(String(arg.argumentId))"
              >
                {{ arg.argumentLabel || arg.argumentId }}
              </button>
            </div>
          </div>

          <!-- Row 4: context parts -->
          <div class="field-group">
            <label class="field-label">Kontextové části</label>
            <div v-if="selectedContextNames.length" class="tag-list">
              <span v-for="cp in selectedContextNames" :key="cp.id" class="tag">
                {{ cp.name }}
                <button type="button" class="tag-remove" :disabled="isExecutingHere" @click="removeContext(cp.id)">✕</button>
              </span>
            </div>
            <div class="relative">
              <input
                v-model="contextSearch"
                type="text"
                placeholder="Přidat kontext…"
                class="field-input"
                :disabled="isExecutingHere"
                @focus="showContextDropdown = true"
                @blur="hideContextDropdown"
              />
              <div v-if="showContextDropdown && filteredContext.length" class="dropdown">
                <button
                  v-for="cp in filteredContext"
                  :key="cp.id"
                  type="button"
                  class="dropdown-item"
                  @mousedown.prevent="addContext(cp.id)"
                >{{ cp.name }}</button>
              </div>
            </div>
          </div>

          <!-- Row 5: manual context -->
          <div class="field-group">
            <label class="field-label">Vlastní kontext</label>
            <textarea
              v-model="ctx.opConfig.value.manualContext"
              rows="2"
              class="field-input field-textarea"
              placeholder="Zadejte vlastní kontext…"
              :disabled="isExecutingHere"
            />
          </div>

          <!-- Generate / Stop button -->
          <button
            v-if="isExecutingHere"
            class="btn-run btn-run--stop"
            @click="onCancelClick"
          >
            <svg class="btn-stop-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" stroke-width="2" fill="currentColor" stroke="none" />
            </svg>
            Zastavit generování
          </button>
          <button
            v-else
            :disabled="isExecuting || !canGenerate"
            class="btn-run btn-run--indigo"
            @click="onGenerateClick"
          >
            {{ draft ? 'Znovu generovat e-mail' : 'Generovat e-mail' }}
          </button>
          <p v-if="isExecutingElsewhere" class="busy-hint">
            Právě běží generování e-mailu pro jiného partnera — počkejte, než skončí.
          </p>
        </div>
      </div>

      <!-- ── Email fields ──────────────────────────────────────── -->
      <div class="email-fields">
        <div class="email-field-row">
          <span class="email-field-label">Předmět</span>
          <input v-model="emailSubject" type="text" class="email-field-input" placeholder="Předmět e-mailu…" :disabled="isExecutingHere" />
        </div>
        <div class="email-field-row">
          <span class="email-field-label">Komu</span>
          <input v-model="emailTo" type="email" class="email-field-input" placeholder="E-mailová adresa…" :disabled="isExecutingHere" />
        </div>
      </div>

      <!-- ── Stream output ─────────────────────────────────────── -->
      <div v-if="ctx.executing.value === 'draft' && isExecutingHere && ctx.streamOutput.value" ref="streamBoxEl" class="stream-box">
        <pre class="stream-text">{{ ctx.streamOutput.value }}</pre>
      </div>

      <!-- ── Rich text editor ─────────────────────────────────── -->
      <div class="editor-area">
        <RichTextEditor v-model="emailBody" placeholder="Vygenerovaný e-mail se zobrazí zde..." :default-font="defaultFont" :editable="!isExecutingHere" />
      </div>

      <!-- ── Recommendations ───────────────────────────────────── -->
      <div v-if="recommendations.length" class="recommendations-panel">
        <button type="button" class="recommendations-header" @click="recsCollapsed = !recsCollapsed">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="rec-icon">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Doporučení
          <svg class="toggle-chevron toggle-chevron--end" :class="{ 'toggle-chevron--collapsed': recsCollapsed }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <ul v-show="!recsCollapsed" class="recommendations-list">
          <li v-for="(rec, i) in recommendations" :key="i" class="recommendations-item">{{ rec }}</li>
        </ul>
      </div>

      <!-- ── Footer ───────────────────────────────────────────── -->
      <div class="panel-footer">
        <div class="footer-meta">
          <template v-if="draft?.savedAt">
            <template v-if="draft?.sentAt">
              <span class="sent-check">✓</span> Odesláno {{ relTime(String(draft.sentAt)) }} ·
            </template>
            Uložil/a {{ (draft as any).savedBy?.name ?? '?' }} {{ relTime(String(draft.savedAt)) }}
          </template>
        </div>
        <div v-if="emailBody.trim()" class="footer-actions">
          <button
            :disabled="saving || isExecutingHere"
            class="btn-secondary"
            @click="doSave"
          >
            <svg v-if="saving" class="btn-spinner btn-spinner--sm" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Uložit
          </button>
          <button
            :disabled="!emailTo.trim() || !emailSubject.trim() || !selectedSignatureId || saving || hasPendingSend || isExecutingHere"
            class="btn-primary"
            @click="handleSendClick"
          >
            Uložit a odeslat
          </button>
        </div>
      </div>
    </template>

    <!-- Sender confirmation modal -->
    <Teleport to="body">
      <div v-if="showSenderConfirmModal" class="modal-backdrop" @click.self="showSenderConfirmModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">Potvrdit odeslání</h2>
          <button class="modal-close" @click="showSenderConfirmModal = false">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p v-if="isSubstitutingSend" class="modal-text">
            Tento e-mail připravil jiný uživatel. Zkontrolovali jste, zda v textu nebo podpisu nezůstalo jméno původního autora?
          </p>
          <p v-if="hasActiveCommunication" class="modal-text">
            S tímto partnerem už probíhá <strong>aktivní komunikace</strong> — byl mu odeslán e-mail. Opravdu chcete odeslat další?
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showSenderConfirmModal = false">
            Zpět k úpravám
          </button>
          <button class="btn-primary" @click="doSend">
            Potvrdit a odeslat
          </button>
        </div>
      </div>
      </div>
    </Teleport>

    <!-- Cancel confirmation modal -->
    <Teleport to="body">
    <div v-if="showCancelConfirm" class="confirm-overlay" @click.self="showCancelConfirm = false">
      <div class="confirm-modal">
        <div class="confirm-header">
          <h3 class="confirm-title">Zastavit generování?</h3>
          <button class="confirm-close" @click="showCancelConfirm = false">✕</button>
        </div>
        <div class="confirm-body">
          <p class="confirm-warn confirm-warn--red">
            Probíhající generování e-mailu bude přerušeno. Výsledky nebudou uloženy.
          </p>
        </div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn--cancel" @click="showCancelConfirm = false">Pokračovat v generování</button>
          <button class="confirm-btn confirm-btn--stop" @click="confirmCancel">Zastavit</button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Run confirmation modal -->
    <Teleport to="body">
      <div v-if="showConfirm" class="confirm-overlay" @click.self="showConfirm = false">
        <div class="confirm-modal">
          <div class="confirm-header">
            <h3 class="confirm-title">Potvrzení akce</h3>
            <button class="confirm-close" @click="showConfirm = false">✕</button>
          </div>
          <div class="confirm-body">
            <p v-if="ctx.isSubstituting.value" class="confirm-warn">
              Tento e-mail generujete jménem jiného člena týmu — partner je přiřazen uživateli
              <strong>{{ ctx.partnerDetail.value?.assignment?.assignee?.name }}</strong>, ne vám.
            </p>
            <p v-if="isRegeneration" class="confirm-warn">
              Pro tohoto partnera už existuje vygenerovaný e-mail. Spuštěním dojde k jeho
              <strong>přepsání</strong> a akce spotřebuje <strong>kredity z budgetu</strong>.
            </p>
            <p v-if="hasActiveCommunication" class="confirm-warn">
              S tímto partnerem už probíhá <strong>aktivní komunikace</strong> — byl mu odeslán e-mail. Zvažte, zda je další draft opravdu potřeba.
            </p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" @click="showConfirm = false">Zrušit</button>
            <button class="confirm-btn confirm-btn--confirm" @click="confirmAndGenerate">Potvrdit a spustit</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.panel-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Empty state ─────────────────────────────────────────── */
.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #9ca3af;
  font-size: 14px;
  text-align: center;
  padding: 32px;
  line-height: 1.5;
}

.panel-empty .highlight { color: #4338ca; font-style: normal; }

.empty-icon {
  width: 36px;
  height: 36px;
  color: #d1d5db;
}

/* ── Config section ──────────────────────────────────────── */
.panel-config {
  border-bottom: 1px solid #e9eaec;
  flex-shrink: 0;
}

.panel-config-body {
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: #374151;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.15s;
}

.section-toggle:hover { color: #4338ca; }

.toggle-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.toggle-chevron--collapsed { transform: rotate(-90deg); }

.toggle-chevron--end { margin-left: auto; }

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.02em;
}

.field-select,
.field-input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13px;
  color: #1f2937;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  appearance: none;
}

.field-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 16px;
  padding-right: 28px;
}

.field-select:focus,
.field-input:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
}

.field-select--warn {
  border-color: #fbbf24;
  background-color: #fffbeb;
}

.field-textarea {
  resize: none;
  line-height: 1.5;
}

.no-contact {
  padding: 7px 10px;
  font-size: 13px;
  color: #dc2626;
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 7px;
}

.no-sig {
  padding: 7px 10px;
  font-size: 12px;
  color: #92400e;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 7px;
}

.no-sig-link {
  color: #b45309;
  text-decoration: underline;
  margin-left: 4px;
}

/* ── Argument chips ──────────────────────────────────────── */
.arg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.arg-chip {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}

.arg-chip:hover { border-color: #a5b4fc; color: #4338ca; }

.arg-chip--active {
  background: #ecfdf5;
  border-color: #6ee7b7;
  color: #065f46;
}

/* ── Tags ────────────────────────────────────────────────── */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 10px;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: none;
  background: transparent;
  color: #818cf8;
  cursor: pointer;
  font-size: 10px;
  border-radius: 50%;
  padding: 0;
  transition: background 0.1s;
}

.tag-remove:hover { background: #c7d2fe; }

/* ── Dropdown ────────────────────────────────────────────── */
.relative { position: relative; }

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 4px;
  z-index: 50;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  max-height: 140px;
  overflow-y: auto;
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 9px 14px;
  font-size: 13px;
  color: #374151;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.1s;
}

.dropdown-item:hover { background: #eef2ff; color: #4338ca; }

/* ── Generate button ─────────────────────────────────────── */
.btn-run {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-run:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-run:active:not(:disabled) { transform: translateY(0); }
.btn-run:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-run--indigo {
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: #fff;
}

.btn-run--stop {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
}

.btn-stop-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.busy-hint {
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  animation: spin 0.8s linear infinite;
}

.btn-spinner--sm {
  width: 12px;
  height: 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Email fields ────────────────────────────────────────── */
.email-fields {
  border-bottom: 1px solid #e9eaec;
  padding: 10px 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.email-field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.email-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  width: 58px;
  flex-shrink: 0;
}

.email-field-input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13px;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.email-field-input:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
}

.email-field-input::placeholder { color: #9ca3af; }

/* ── Stream output ───────────────────────────────────────── */
.stream-box {
  border-bottom: 1px solid #e9eaec;
  padding: 10px 16px;
  max-height: 90px;
  overflow-y: auto;
  background: #fafafa;
  flex-shrink: 0;
}

.stream-text {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #6b7280;
  white-space: pre-wrap;
  line-height: 1.6;
  margin: 0;
}

/* ── Editor ──────────────────────────────────────────────── */
.editor-area {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
}

/* ── Recommendations ────────────────────────────────────── */
.recommendations-panel {
  border-top: 1px solid #e9eaec;
  padding: 10px 16px 12px;
  flex-shrink: 0;
  background: #f9fafb;
}

.recommendations-header {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
  cursor: pointer;
  transition: color 0.15s;
}

.recommendations-header:hover { color: #4338ca; }

.rec-icon {
  width: 13px;
  height: 13px;
  color: #9ca3af;
  flex-shrink: 0;
}

.recommendations-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.recommendations-item {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  padding-left: 14px;
  position: relative;
}

.recommendations-item::before {
  content: '·';
  position: absolute;
  left: 3px;
  color: #9ca3af;
}

/* ── Footer ──────────────────────────────────────────────── */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #e9eaec;
  padding: 10px 16px;
  flex-shrink: 0;
  gap: 12px;
}

.footer-meta {
  font-size: 12px;
  color: #9ca3af;
  min-width: 0;
  flex: 1;
}

.sent-check {
  color: #10b981;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-secondary,
.btn-primary {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}

.btn-secondary:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
}

.btn-secondary:hover:not(:disabled) { background: #f9fafb; border-color: #d1d5db; }

.btn-primary {
  border: none;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
}

.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }

/* ── Sender confirmation modal ──────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 420px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #f3f4f6;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.modal-close {
  color: #9ca3af;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: color 0.15s;
}

.modal-close:hover { color: #374151; }

.modal-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid #f3f4f6;
}

/* ── Confirmation modal ──────────────────────────────────── */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
  padding: 16px;
}

.confirm-modal {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 420px;
  overflow: hidden;
}

.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e9eaec;
}

.confirm-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1d23;
  margin: 0;
}

.confirm-close {
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 4px;
}

.confirm-close:hover { color: #6b7280; }

.confirm-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.confirm-warn {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #4b5563;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 10px 12px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #e9eaec;
}

.confirm-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.confirm-btn--cancel {
  background: transparent;
  color: #6b7280;
}

.confirm-btn--cancel:hover { color: #374151; }

.confirm-btn--confirm {
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  color: #fff;
}

.confirm-btn--confirm:hover { opacity: 0.9; }

.confirm-btn--stop {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
}

.confirm-btn--stop:hover { opacity: 0.9; }

.confirm-warn--red {
  background: #fef2f2;
  border-color: #fecaca;
}
</style>
