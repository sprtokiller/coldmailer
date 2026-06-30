<script setup lang="ts">
import { projectOutreachKey } from '~/composables/useProjectOutreach'

const ctx = inject(projectOutreachKey)!

const claiming = ref(false)
const error = ref('')

async function claim() {
  error.value = ''
  claiming.value = true
  try {
    await ctx.claimPartner()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    claiming.value = false
  }
}
</script>

<template>
  <div class="claim-wrap">
    <div v-if="!ctx.selectedPartnerId.value" class="claim-empty">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:40px;height:40px;color:#d1d5db;margin-bottom:12px">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a4 4 0 00-5.197-3.795M9 20H4v-2a4 4 0 015.197-3.795M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>Vyberte partnera ze seznamu</span>
    </div>

    <div v-else class="claim-content">
      <div class="claim-icon-wrap">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="claim-icon">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </div>

      <h2 class="claim-title">Partner čeká na zpracování</h2>
      <p class="claim-partner-name">{{ ctx.selectedPartner.value?.canonicalName }}</p>
      <p class="claim-desc">
        Tento partner zatím není přiřazen. Zapište se k němu a získáte přístup ke zpracování — Value Alignment a přípravě e-mailu.
      </p>

      <button
        class="claim-btn"
        :disabled="claiming"
        @click="claim"
      >
        <svg v-if="claiming" class="btn-spinner" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{{ claiming ? 'Zapisuji…' : `Zapsat se k partnerovi ${ctx.selectedPartner.value?.canonicalName ?? ''}` }}</span>
      </button>

      <p v-if="error" class="claim-error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.claim-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
  background: #fafbfc;
}

.claim-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #9ca3af;
  font-size: 13px;
  text-align: center;
}

.claim-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 420px;
  gap: 12px;
}

.claim-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #ede9fe;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.claim-icon {
  width: 36px;
  height: 36px;
  color: #7c3aed;
}

.claim-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1d23;
  margin: 0;
}

.claim-partner-name {
  font-size: 15px;
  font-weight: 600;
  color: #7c3aed;
  margin: 0;
}

.claim-desc {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
  margin: 0;
}

.claim-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 12px 24px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  max-width: 100%;
  word-break: break-word;
}

.claim-btn:hover:not(:disabled) { background: #6d28d9; }
.claim-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-spinner {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.claim-error {
  font-size: 12px;
  color: #dc2626;
  margin: 0;
}
</style>
