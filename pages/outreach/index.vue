<script setup lang="ts">
import { projectOutreachKey, useProjectOutreach } from '~/composables/useProjectOutreach'

definePageMeta({ middleware: 'auth', layout: false })

const { activeProject } = useActiveProject()
const projectId = computed(() => activeProject.value?.id ?? null)

const ctx = useProjectOutreach(projectId)
provide(projectOutreachKey, ctx)

const { syncError } = useGmailSync()

const unclaiming = ref(false)
async function doUnclaim() {
  if (!confirm('Opravdu chcete odstoupit od tohoto partnera? Ztratíte přístup k jeho zpracování.')) return
  unclaiming.value = true
  try {
    await ctx.unclaimPartner()
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  } finally {
    unclaiming.value = false
  }
}

const showClaimView = computed(() => {
  if (!ctx.selectedPartnerId.value) return false
  if (ctx.canManageAll.value) return false
  return !ctx.isAssignedToMe.value
})

const showAssignDropdown = ref(false)
const assignMembers = ref<Array<{ id: string; name: string; email: string; image: string | null }>>([])
const loadingMembers = ref(false)

async function openAssignDropdown() {
  loadingMembers.value = true
  showAssignDropdown.value = true
  try {
    assignMembers.value = await $fetch<typeof assignMembers.value>(`/api/projects/${projectId.value}/members`)
  } finally {
    loadingMembers.value = false
  }
}

async function doAssign(userId: string | null) {
  showAssignDropdown.value = false
  try {
    await ctx.assignPartner(userId)
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  }
}

function closeAssignDropdown() { showAssignDropdown.value = false }
onMounted(() => { document.addEventListener('click', closeAssignDropdown) })
onUnmounted(() => { document.removeEventListener('click', closeAssignDropdown) })
</script>

<template>
  <div class="outreach-root">
    <AppNav />

    <div v-if="syncError === 'auth-error'" class="auth-error-banner">
      <div class="auth-error-inner">
        <span>Synchronizace emailů selhala kvůli ověření.</span>
        <a href="/api/auth/login" class="auth-error-link">Přihlásit se znovu</a>
      </div>
      <button class="auth-error-close" @click="syncError = null">×</button>
    </div>

    <div class="outreach-workspace">
      <aside class="outreach-col outreach-col--partners">
        <div class="col-header">
          <h2 class="col-title">Partneři</h2>
          <span v-if="ctx.visiblePartnerCount.value" class="col-badge">{{ ctx.visiblePartnerCount.value }}</span>
        </div>
        <OutreachPartnerSidebar class="col-body" />
      </aside>

      <div class="col-divider" />

      <template v-if="showClaimView">
        <section class="outreach-col outreach-col--claim">
          <div class="col-header">
            <h2 class="col-title">Zpracování partnera</h2>
          </div>
          <OutreachClaimPanel class="col-body" />
        </section>
      </template>

      <template v-else>
        <section class="outreach-col outreach-col--alignment">
          <div class="col-header">
            <span class="col-step-pill col-step-pill--violet">1</span>
            <h2 class="col-title">Value Alignment</h2>
            <ClientOnly>
              <button
                v-if="ctx.isAssignedToMe.value && !ctx.canManageAll.value && ctx.selectedPartnerId.value"
                class="unclaim-btn"
                :disabled="unclaiming"
                @click="doUnclaim"
              >{{ unclaiming ? 'Odstupuji…' : 'Odstoupit' }}</button>
              <div v-if="ctx.canManageAll.value && ctx.selectedPartnerId.value" class="assignment-ctrl" @click.stop>
                <button class="assignment-ctrl-btn" @click="openAssignDropdown">
                  <span v-if="ctx.selectedPartner.value?.assignment">
                    {{ ctx.selectedPartner.value.assignment.assignee.name.split(' ')[0] }}
                  </span>
                  <span v-else class="assignment-ctrl-free">Přiřadit</span>
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-if="showAssignDropdown" class="assignment-dropdown">
                  <div v-if="loadingMembers" class="assignment-dropdown-loading">Načítám…</div>
                  <template v-else>
                    <button
                      v-for="m in assignMembers"
                      :key="m.id"
                      class="assignment-dropdown-item"
                      :class="{ 'assignment-dropdown-item--active': ctx.selectedPartner.value?.assignment?.assigneeId === m.id }"
                      @click="doAssign(m.id)"
                    >
                      {{ m.name }}
                    </button>
                    <div class="assignment-dropdown-divider" />
                    <button class="assignment-dropdown-item assignment-dropdown-item--remove" @click="doAssign(null)">
                      Odebrat přiřazení
                    </button>
                  </template>
                </div>
              </div>
            </ClientOnly>
          </div>
          <OutreachAlignmentPanel class="col-body" />
        </section>

        <div class="col-divider" />

        <section class="outreach-col outreach-col--email">
          <div class="col-header">
            <span class="col-step-pill col-step-pill--indigo">2</span>
            <h2 class="col-title">E-mail</h2>
          </div>
          <OutreachEmailPanel class="col-body" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.outreach-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f8f9fb;
}

.outreach-workspace {
  flex: 1 1 0;
  display: flex;
  width: 100%;
  min-height: 0;
  padding: 12px 16px;
  gap: 12px;
  background: #f0f1f5;
  overflow: hidden;
  box-sizing: border-box;
}

.outreach-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  overflow: hidden;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
}

.outreach-col--partners { width: 260px; flex-shrink: 0; }
.outreach-col--alignment { flex: 1 1 0; min-width: 320px; }
.outreach-col--email { flex: 1.6 1 0; min-width: 380px; }
.outreach-col--claim { flex: 2.6 1 0; min-width: 320px; }

.col-divider { width: 1px; background: #e9eaec; flex-shrink: 0; }

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 11px;
  border-bottom: 1px solid #e9eaec;
  flex-shrink: 0;
  background: #fff;
}

.col-title { font-size: 13px; font-weight: 600; color: #1a1d23; margin: 0; letter-spacing: -0.01em; }

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

.col-step-pill--violet { background: #ede9fe; color: #7c3aed; }
.col-step-pill--indigo { background: #e0e7ff; color: #4338ca; }

.unclaim-btn {
  margin-left: auto;
  padding: 3px 10px;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  cursor: pointer;
  transition: background 0.12s;
}
.unclaim-btn:hover:not(:disabled) { background: #fef2f2; }
.unclaim-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.assignment-ctrl { position: relative; margin-left: auto; }

.assignment-ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}

.assignment-ctrl-btn:hover { background: #f0ebff; border-color: #c4b5fd; color: #6d28d9; }
.assignment-ctrl-free { color: #7c3aed; }

.assignment-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 50;
  min-width: 160px;
  padding: 4px;
}

.assignment-dropdown-loading { padding: 8px 12px; font-size: 12px; color: #9ca3af; }

.assignment-dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  color: #1f2937;
  cursor: pointer;
  transition: background 0.1s;
}

.assignment-dropdown-item:hover { background: #f5f3ff; }
.assignment-dropdown-item--active { font-weight: 700; color: #7c3aed; }
.assignment-dropdown-item--remove { color: #dc2626; }
.assignment-dropdown-item--remove:hover { background: #fef2f2; }
.assignment-dropdown-divider { height: 1px; background: #e9eaec; margin: 4px 0; }

.col-body { flex: 1; min-height: 0; overflow: hidden; }

.auth-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  flex-shrink: 0;
}

.auth-error-inner { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #b91c1c; }
.auth-error-link { font-weight: 600; text-decoration: underline; color: #b91c1c; }

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

<style>
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
#__nuxt { height: 100%; overflow: hidden; }
</style>
