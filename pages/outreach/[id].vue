<script setup lang="ts">
import { projectOutreachKey, useProjectOutreach } from '~/composables/useProjectOutreach'

definePageMeta({ middleware: 'auth', layout: false })

const route = useRoute()
const projectId = computed(() => route.params.id as string)

const ctx = useProjectOutreach(projectId)
provide(projectOutreachKey, ctx)

const { syncError } = useGmailSync()

</script>

<template>
  <div class="outreach-root">
    <!-- Top nav (reused) -->
    <AppNav full-width />

    <!-- Auth error banner -->
    <div v-if="syncError === 'auth-error'" class="auth-error-banner">
      <div class="auth-error-inner">
        <span>Synchronizace emailů selhala kvůli ověření.</span>
        <a href="/api/auth/login" class="auth-error-link">Přihlásit se znovu</a>
      </div>
      <button class="auth-error-close" @click="syncError = null">×</button>
    </div>

    <!-- 3-column workspace -->
    <div class="outreach-workspace">
      <!-- Col 1: Partner list -->
      <aside class="outreach-col outreach-col--partners">
        <div class="col-header">
          <h2 class="col-title">Partneři</h2>
          <span v-if="ctx.partners.value.length" class="col-badge">{{ ctx.partners.value.length }}</span>
        </div>
        <OutreachPartnerSidebar class="col-body" />
      </aside>

      <!-- Divider -->
      <div class="col-divider" />

      <!-- Col 2: Value Alignment -->
      <section class="outreach-col outreach-col--alignment">
        <div class="col-header">
          <span class="col-step-pill col-step-pill--violet">1</span>
          <h2 class="col-title">Value Alignment</h2>
        </div>
        <OutreachAlignmentPanel class="col-body" />
      </section>

      <!-- Divider -->
      <div class="col-divider" />

      <!-- Col 3: Email -->
      <section class="outreach-col outreach-col--email">
        <div class="col-header">
          <span class="col-step-pill col-step-pill--indigo">2</span>
          <h2 class="col-title">E-mail</h2>
        </div>
        <OutreachEmailPanel class="col-body" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.outreach-root {
  display: flex;
  flex-direction: column;
  /* 100% fills the parent (body) without including scrollbar — no 100vw */
  width: 100%;
  /* Use min-height + flex to avoid exceeding viewport */
  height: 100%;
  overflow: hidden;
  background: #f8f9fb;
}

.outreach-workspace {
  flex: 1 1 0;
  display: flex;
  width: 100%;
  min-height: 0;
  /* Narrow the sides slightly for breathing room */
  padding: 0 16px 12px;
  gap: 12px;
  background: #f0f1f5;
  overflow: hidden;
  box-sizing: border-box;
}

/* ── Columns ─────────────────────────────────────────────── */
.outreach-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  overflow: hidden;
  /* Rounded corners since columns now float on bg */
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
}

.outreach-col--partners {
  width: 260px;
  flex-shrink: 0;
}

.outreach-col--alignment {
  flex: 1 1 0;
  min-width: 320px;
}

.outreach-col--email {
  flex: 1.6 1 0;
  min-width: 380px;
}

/* ── Dividers ────────────────────────────────────────────── */
.col-divider {
  width: 1px;
  background: #e9eaec;
  flex-shrink: 0;
}

/* ── Column header ───────────────────────────────────────── */
.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 11px;
  border-bottom: 1px solid #e9eaec;
  flex-shrink: 0;
  background: #fff;
}

.col-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1d23;
  margin: 0;
  letter-spacing: -0.01em;
}

.col-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #f0f1f5;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
}

.col-step-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.col-step-pill--violet {
  background: #ede9fe;
  color: #7c3aed;
}

.col-step-pill--indigo {
  background: #e0e7ff;
  color: #4338ca;
}

/* ── Column body (scrollable area) ──────────────────────── */
.col-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Auth error banner ───────────────────────────────────── */
.auth-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  flex-shrink: 0;
}

.auth-error-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #b91c1c;
}

.auth-error-link {
  font-weight: 600;
  text-decoration: underline;
  color: #b91c1c;
}

.auth-error-close {
  background: transparent;
  border: none;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.auth-error-close:hover { color: #dc2626; }
</style>

<!-- Global resets for outreach page -->
<style>
/* Prevent body/html from adding extra height or scrollbars */
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }

/* Make the Nuxt app root fill the viewport exactly */
#__nuxt { height: 100%; overflow: hidden; }
</style>
