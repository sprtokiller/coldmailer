import { canvasKey } from '~/composables/usePipelineCanvas'
import { pipelineRunKey, type PipelineRunContext } from '~/composables/usePipelineRunPage'
import { STEP_MODEL, MODEL_BADGE } from '~/config/pipeline'
import type { StepRecord } from '~/composables/usePipelineCanvas'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STEP_ORDER = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION']

export const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  MINI_DEEP_RESEARCH: { label: 'AI Výsledek', cls: 'bg-blue-100 text-blue-700' },
  AI_IMPORT:          { label: 'AI Import',   cls: 'bg-emerald-100 text-emerald-700' },
  MANUAL_ADD:         { label: 'Ručně',        cls: 'bg-gray-100 text-gray-600' },
  GLOBAL_DB_SELECT:   { label: 'Z databáze',  cls: 'bg-rose-100 text-rose-700' },
  legacy:             { label: 'Legacy',       cls: 'bg-amber-100 text-amber-700' },
}
export const LEVEL_LABELS: Record<string, string> = {
  school: 'Školní', regional: 'Regionální', national: 'Národní', international: 'Mezinárodní',
}
export const COMP_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-600', inactive: 'bg-gray-100 text-gray-400', uncertain: 'bg-amber-50 text-amber-600',
}
export const COMP_STATUS_LABELS: Record<string, string> = {
  active: 'Aktivní', inactive: 'Neaktivní', uncertain: 'Nejistý',
}
export const CONTACT_TYPE_COLORS: Record<string, string> = {
  PR: 'bg-blue-100 text-blue-700', HR: 'bg-purple-100 text-purple-700',
  Marketing: 'bg-orange-100 text-orange-700', CEO: 'bg-red-100 text-red-700',
  General: 'bg-gray-100 text-gray-600',
}
export const CONFIDENCE_COLORS: Record<string, string> = {
  High: 'text-green-600', Medium: 'text-amber-600', Low: 'text-red-400',
}
export const SIZE_LABELS: Record<string, string> = {
  micro: '<10', small: '10–50', medium: '50–500', large: '500–5k', enterprise: '>5k',
}

const STEP_LABELS: Record<string, string> = {
  MARKET_SCANNING: 'Market Scanning', PARTNER_IDENTIFICATION: 'Identifikace partnerů',
  PARTNER_PROFILING: 'Profilování partnerů', VALUE_ALIGNMENT: 'Value Alignment',
  OUTREACH_PREPARATION: 'Příprava oslovení', OUTREACH_EXECUTION: 'Odeslání oslovení',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getStr(obj: Record<string, unknown>, key: string): string { return String(obj[key] ?? '') }
export function getArr(obj: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const v = obj[key]; return Array.isArray(v) ? v as Array<Record<string, unknown>> : []
}
export function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key]; return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {}
}
export function renderLinks(text: string): string {
  if (!text) return ''
  // Tolerant markdown link parsing: optional backslash-escaped brackets, whitespace
  // between ] and (, angle-bracket URLs, optional "title", and www. without protocol
  return text.replace(
    /\\?\[([^\[\]\n]+?)\\?\]\s*\(\s*<?((?:https?:\/\/|www\.)[^\s)>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g,
    (_, label: string, url: string) => {
      const href = url.startsWith('www.') ? `https://${url}` : url
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 underline hover:opacity-80">${label}</a>`
    },
  )
}
export function isLegacyRef(r: { id: string }): boolean { return r.id.startsWith('legacy-') }
export function sourceConfig(type?: string | null) { return SOURCE_CONFIG[type ?? 'legacy'] ?? SOURCE_CONFIG.legacy }

// ── Composable ────────────────────────────────────────────────────────────────

export function useOverlayCore() {
  const canvas = inject(canvasKey)!
  const pipeline = inject(pipelineRunKey) as PipelineRunContext | undefined
  const route = useRoute()
  const currentRunId = route.params.id as string

  const activeNode = computed(() => canvas.activeOverlayNode.value)
  const activeEdgeId = computed(() => canvas.selectedEdgeId.value)
  const isOpen = computed(() => activeNode.value !== null || activeEdgeId.value !== null)
  const stepId = computed(() => activeNode.value?.stepId ?? null)
  const stepType = computed(() => activeNode.value?.stepType ?? null)

  const matchedStep = computed(() =>
    pipeline && stepType.value ? pipeline.steps.find(s => s.key === stepType.value) ?? null : null
  )
  const stepIdx = computed(() => stepType.value ? STEP_ORDER.indexOf(stepType.value) : -1)
  const stepRecordType = computed(() => {
    if (stepType.value === 'MARKET_SCANNING') return 'COMPETITION'
    if (stepType.value === 'PARTNER_IDENTIFICATION') return 'PARTNER'
    return undefined
  })
  const isOutputStep = computed(() =>
    ['PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION'].includes(stepType.value ?? '')
  )
  const activeTab = ref<'input' | 'result' | 'config'>('result')
  const allRecords = computed<StepRecord[]>(() => stepId.value ? canvas.stepRecords.value[stepId.value] ?? [] : [])
  const currentNodeSources = computed(() => {
    const selected = canvas.nodes.value.find(n => n.id === canvas.selectedNodeId.value)
    if (!selected) return []
    if (selected.data.stepType === 'MARKET_SCANNING' || selected.data.stepType === 'PARTNER_IDENTIFICATION') {
      return canvas.nodes.value
        .filter(n => n.data.stepType === selected.data.stepType)
        .flatMap(n => n.data.sources ?? [])
    }
    return selected.data.sources ?? []
  })
  const totalRecords = computed(() => allRecords.value.length)
  const recordsLoading = computed(() => stepId.value ? canvas.stepRecordsLoading.value[stepId.value] : false)
  const expandedCardIdx = ref<number | null>(null)
  function toggleCard(i: number) { expandedCardIdx.value = expandedCardIdx.value === i ? null : i }

  const overlayTitle = computed(() => {
    if (activeEdgeId.value) {
      const edge = canvas.edges.value.find(e => e.id === activeEdgeId.value)
      if (edge) {
        const targetNode = canvas.nodes.value.find(n => n.id === edge.target)
        const label = targetNode ? STEP_LABELS[targetNode.data.stepType] : null
        return label ? `Vstup do: ${label}` : 'Tok mezi kroky'
      }
      return 'Tok mezi kroky'
    }
    return stepType.value ? STEP_LABELS[stepType.value] ?? stepType.value : ''
  })
  const modelBadge = computed(() => {
    if (!stepType.value) return null
    const model = STEP_MODEL[stepType.value]
    return model ? MODEL_BADGE[model] ?? null : null
  })

  return {
    canvas, pipeline, currentRunId,
    activeNode, activeEdgeId, isOpen,
    stepId, stepType, matchedStep, stepIdx, stepRecordType,
    isOutputStep, activeTab,
    allRecords, totalRecords, recordsLoading, currentNodeSources,
    expandedCardIdx, toggleCard, overlayTitle, modelBadge,
  }
}

export type OverlayCoreState = ReturnType<typeof useOverlayCore>
