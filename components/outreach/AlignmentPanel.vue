<script setup lang="ts">
import { projectOutreachKey } from '~/composables/useProjectOutreach'

const ctx = inject(projectOutreachKey)!

const alignment = computed(() => {
  const d = ctx.partnerDetail.value
  if (!d?.alignment) return null
  return d.alignment as Record<string, unknown>
})

const alignmentOutput = computed(() => alignment.value?.outputData as Record<string, unknown> | null ?? null)

const topArguments = computed(() => {
  const a = alignmentOutput.value
  if (!a) return []
  const t = a.topArguments
  if (Array.isArray(t)) return (t as Array<{ argumentId?: string; argumentLabel?: string; whyItFits?: string; rank?: number }>).filter(arg => Boolean(arg?.argumentId))
  return []
})

const snapshot = computed(() => String(alignmentOutput.value?.partnerSnapshot ?? ''))

const vaPrompts = computed(() => ctx.promptsForStep('VALUE_ALIGNMENT'))
const vaSellingPoints = computed(() => ctx.sellingPoints.value)
const vaContextParts = computed(() => ctx.contextParts.value.filter(cp => cp.stepKeys.includes('VALUE_ALIGNMENT')))

const contextSearch = ref('')
const showContextDropdown = ref(false)
function hideContextDropdown() { setTimeout(() => { showContextDropdown.value = false }, 150) }
const filteredContext = computed(() =>
  vaContextParts.value.filter(cp =>
    !ctx.vaConfig.value.contextPartIds.includes(cp.id) &&
    cp.name.toLowerCase().includes(contextSearch.value.toLowerCase()),
  ),
)
function addContext(id: string) { if (!ctx.vaConfig.value.contextPartIds.includes(id)) ctx.vaConfig.value.contextPartIds.push(id); contextSearch.value = '' }
function removeContext(id: string) { ctx.vaConfig.value.contextPartIds = ctx.vaConfig.value.contextPartIds.filter(x => x !== id) }

const selectedContextNames = computed(() => ctx.vaConfig.value.contextPartIds.map(id => vaContextParts.value.find(c => c.id === id)).filter(Boolean) as Array<{ id: string; name: string }>)

const isRegeneration = computed(() => !!alignment.value)
const hasActiveCommunication = computed(() => !!ctx.partnerDetail.value?.hasActiveCommunication)
const needsConfirm = computed(() => ctx.isSubstituting.value || isRegeneration.value || hasActiveCommunication.value)
const showConfirm = ref(false)
const showCancelConfirm = ref(false)

const isExecutingHere = computed(() => !!ctx.selectedPartnerId.value && ctx.runningAlignmentIds.value.has(ctx.selectedPartnerId.value))
const currentStreamOutput = computed(() => (ctx.selectedPartnerId.value && ctx.alignmentStreamOutputs.value.get(ctx.selectedPartnerId.value)) || '')
const streamBoxEl = ref<HTMLElement | null>(null)

watch(currentStreamOutput, async () => {
  await nextTick()
  if (streamBoxEl.value) streamBoxEl.value.scrollTop = streamBoxEl.value.scrollHeight
})

function onRunClick() {
  if (needsConfirm.value) { showConfirm.value = true; return }
  ctx.runAlignment()
}

function confirmAndRun() {
  showConfirm.value = false
  ctx.runAlignment()
}

function onCancelClick() {
  showCancelConfirm.value = true
}

function confirmCancel() {
  showCancelConfirm.value = false
  if (ctx.selectedPartnerId.value) ctx.cancelAlignment(ctx.selectedPartnerId.value)
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'právě teď'
  if (m < 60) return `před ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `před ${h} h`
  return `před ${Math.floor(h / 24)} d`
}
</script>

<template>
  <div class="panel-wrap">
    <!-- Empty state: no partner -->
    <div v-if="!ctx.selectedPartnerId.value" class="panel-empty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="empty-icon">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 15l-4-4m0 0l-4 4m4-4V3M3 9a9 9 0 1118 0 9 9 0 01-18 0z" />
      </svg>
      <p>Vyberte partnera<br/>ze seznamu vlevo.</p>
    </div>

    <template v-else>
      <!-- Config section (fixed) -->
      <div class="panel-config">
        <!-- System prompt -->
        <div class="field-group">
          <label class="field-label">Systémový prompt</label>
          <select v-model="ctx.vaConfig.value.systemPromptId" class="field-select" :disabled="isExecutingHere">
            <option v-for="p in vaPrompts" :key="p.id" :value="p.id">{{ p.isSystem ? '⚙ ' : '' }}{{ p.name }}</option>
          </select>
        </div>

        <!-- Selling point -->
        <div class="field-group">
          <label class="field-label">Prodejní argumenty</label>
          <select v-model="ctx.vaConfig.value.sellingPointId" class="field-select" :disabled="isExecutingHere">
            <option value="">— vyberte —</option>
            <option v-for="sp in vaSellingPoints" :key="sp.id" :value="sp.id">{{ sp.name }}</option>
          </select>
        </div>

        <!-- Context parts -->
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
              placeholder="Přidat z knihovny…"
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

        <!-- Manual context -->
        <div class="field-group">
          <label class="field-label">Vlastní kontext pro analýzu</label>
          <textarea
            v-model="ctx.vaConfig.value.manualContext"
            rows="2"
            class="field-input field-textarea"
            placeholder="Zadejte vlastní kontext…"
            :disabled="isExecutingHere"
          />
        </div>

        <!-- Run / Stop button -->
        <button
          v-if="isExecutingHere"
          class="btn-run btn-run--stop"
          @click="onCancelClick"
        >
          <svg class="btn-stop-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" stroke-width="2" fill="currentColor" stroke="none" />
          </svg>
          Zastavit analýzu
        </button>
        <button
          v-else
          :disabled="!ctx.canRunAI.value"
          class="btn-run btn-run--violet"
          @click="onRunClick"
        >
          {{ alignment ? 'Znovu analyzovat' : 'Spustit analýzu' }}
        </button>
      </div>

      <!-- Streaming output -->
      <div v-if="isExecutingHere && currentStreamOutput" ref="streamBoxEl" class="stream-box">
        <pre class="stream-text">{{ currentStreamOutput }}</pre>
      </div>

      <!-- Results (scrollable) -->
      <div v-if="alignment" class="panel-results">
        <!-- Meta -->
        <p class="result-meta">
          Analyzoval/a <strong>{{ (alignment as any).author?.name ?? '?' }}</strong>
          · {{ relTime(String((alignment as any).updatedAt ?? '')) }}
        </p>

        <!-- Partner snapshot -->
        <div v-if="snapshot" class="result-card result-card--gray">
          <p class="result-card__label">Profil partnera</p>
          <p class="result-card__body">{{ snapshot }}</p>
        </div>

        <!-- Top arguments -->
        <div v-if="topArguments.length" class="result-section">
          <p class="result-section__title">Top argumenty</p>
          <div v-for="arg in topArguments" :key="String(arg.argumentId)" class="result-card result-card--violet">
            <div class="result-card__header">
              <span class="result-card__name">{{ arg.argumentLabel || arg.argumentId }}</span>
              <span v-if="arg.rank" class="result-card__rank">#{{ arg.rank }}</span>
            </div>
            <p v-if="arg.whyItFits" class="result-card__body">{{ arg.whyItFits }}</p>
          </div>
        </div>

        <!-- Raw fallback -->
        <div v-else-if="alignmentOutput" class="result-raw">
          <pre class="stream-text">{{ JSON.stringify(alignmentOutput, null, 2) }}</pre>
        </div>
      </div>
    </template>

    <!-- Cancel confirmation modal -->
    <Teleport to="body">
    <div v-if="showCancelConfirm" class="confirm-overlay" @click.self="showCancelConfirm = false">
      <div class="confirm-modal">
        <div class="confirm-header">
          <h3 class="confirm-title">Zastavit analýzu?</h3>
          <button class="confirm-close" @click="showCancelConfirm = false">✕</button>
        </div>
        <div class="confirm-body">
          <p class="confirm-warn confirm-warn--red">
            Probíhající analýza bude přerušena. Výsledky nebudou uloženy.
          </p>
        </div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn--cancel" @click="showCancelConfirm = false">Pokračovat v analýze</button>
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
              Tuto analýzu spouštíte jménem jiného člena týmu — partner je přiřazen uživateli
              <strong>{{ ctx.partnerDetail.value?.assignment?.assignee?.name }}</strong>, ne vám.
            </p>
            <p v-if="isRegeneration" class="confirm-warn">
              Pro tohoto partnera už existuje hotová analýza Value Alignment. Spuštěním dojde k jejímu
              <strong>přepsání</strong> a akce spotřebuje <strong>kredity z budgetu</strong>.
            </p>
            <p v-if="hasActiveCommunication" class="confirm-warn">
              S tímto partnerem už probíhá <strong>aktivní komunikace</strong> — byl mu odeslán e-mail. Zvažte, zda je další profilace opravdu potřeba.
            </p>
          </div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" @click="showConfirm = false">Zrušit</button>
            <button class="confirm-btn confirm-btn--confirm" @click="confirmAndRun">Potvrdit a spustit</button>
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

.empty-icon {
  width: 36px;
  height: 36px;
  color: #d1d5db;
}

/* ── Config section ──────────────────────────────────────── */
.panel-config {
  padding: 14px 16px;
  border-bottom: 1px solid #e9eaec;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
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
  border-color: #a78bfa;
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.15);
}

.field-textarea {
  resize: none;
  line-height: 1.5;
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
  background: #f0ebff;
  color: #7c3aed;
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
  color: #a78bfa;
  cursor: pointer;
  font-size: 10px;
  border-radius: 50%;
  padding: 0;
  transition: background 0.1s;
}

.tag-remove:hover {
  background: #ddd6fe;
}

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
  max-height: 160px;
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

.dropdown-item:hover {
  background: #f5f3ff;
  color: #7c3aed;
}

/* ── Run button ──────────────────────────────────────────── */
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

.btn-run--violet {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
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

.btn-spinner {
  width: 14px;
  height: 14px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Stream output ───────────────────────────────────────── */
.stream-box {
  border-bottom: 1px solid #e9eaec;
  padding: 12px 16px;
  max-height: 100px;
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

/* ── Results ─────────────────────────────────────────────── */
.panel-results {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-results::-webkit-scrollbar { width: 4px; }
.panel-results::-webkit-scrollbar-track { background: transparent; }
.panel-results::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }

.result-meta {
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-section__title {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

.result-card {
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-card--gray {
  background: #f9fafb;
  border: 1px solid #e9eaec;
}

.result-card--violet {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
}

.result-card__label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.result-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-card__name {
  font-size: 13px;
  font-weight: 600;
  color: #4c1d95;
  flex: 1;
}

.result-card__rank {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
}

.result-card__body {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.55;
  margin: 0;
}

.result-raw {
  background: #f9fafb;
  border: 1px solid #e9eaec;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
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
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
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
