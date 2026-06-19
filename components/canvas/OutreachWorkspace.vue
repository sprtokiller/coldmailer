<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import { STEP_MODEL, MODEL_BADGE } from '~/config/pipeline'
import { outreachWorkspaceKey } from '~/composables/canvas/useOutreachWorkspace'
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
const selectedArgumentIds = ref<Set<string>>(new Set())
const selectedContactIdx = ref<number | null>(null)

provide(outreachWorkspaceKey, {
  hiddenPartners,
  partnerSearch,
  selectedPartner,
  emailBody,
  selectedArgumentIds,
  selectedContactIdx,
})

// Sync the selected partner into step5SelectedIds so executeStep works
watch(selectedPartner, (name) => {
  if (!pipeline) return
  // First, unselect all
  const ids = pipeline.step5SelectedIds
  for (const key of Object.keys(ids)) {
    ids[key] = false
  }
  // Then select the current partner
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
  // Load previously generated email body if available
  const emails = pipeline.outreachEmails() as Array<Record<string, unknown>>
  const emailMatch = emails.find(e => String(e.partnerName ?? e.name ?? '') === name)
  emailBody.value = emailMatch ? String(emailMatch.body ?? emailMatch.emailBody ?? '') : ''
  if (!name) return
  const alignments = pipeline.alignmentOutputAlignments('VALUE_ALIGNMENT') as Array<Record<string, unknown>>
  const match = alignments.find(a => String(a.name ?? a.partnerName ?? '') === name)
  if (!match) return
  const top3 = match.top3Arguments as Array<Record<string, unknown>> | undefined
  if (Array.isArray(top3) && top3.length > 0) {
    selectedArgumentIds.value = new Set([String(top3[0].argumentId ?? '')])
  }
  // Auto-select first contact with email
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
      }
    }
  }
})
</script>

<template>
  <Transition name="workspace">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      @click.self="canvas.closeOverlay()"
    >
      <div class="w-[92vw] h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
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
