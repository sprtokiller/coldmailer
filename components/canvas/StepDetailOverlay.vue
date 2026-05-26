<script setup lang="ts">
import { canvasKey } from '~/composables/usePipelineCanvas'
import { pipelineRunKey } from '~/composables/usePipelineRunPage'
import type { StepRecord } from '~/composables/usePipelineCanvas'
import { STEP_MODEL, MODEL_BADGE } from '~/config/pipeline'

const canvas = inject(canvasKey)!
const pipeline = inject(pipelineRunKey)
const route = useRoute()
const currentRunId = route.params.id as string

const STEP_ORDER = ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION']

// ── Active state ──────────────────────────────────────────────────────────────

const activeNode = computed(() => canvas.activeOverlayNode.value)
const activeEdgeId = computed(() => canvas.selectedEdgeId.value)
const isOpen = computed(() => activeNode.value !== null || activeEdgeId.value !== null)
const stepId = computed(() => activeNode.value?.stepId ?? null)
const stepType = computed(() => activeNode.value?.stepType ?? null)

const matchedStep = computed(() =>
  pipeline && stepType.value ? pipeline.steps.find(s => s.key === stepType.value) ?? null : null
)
const stepIdx = computed(() => stepType.value ? STEP_ORDER.indexOf(stepType.value) : -1)

// Expected record type per step (for DB search filtering)
const stepRecordType = computed(() => {
  if (stepType.value === 'MARKET_SCANNING') return 'COMPETITION'
  if (stepType.value === 'PARTNER_IDENTIFICATION') return 'PARTNER'
  return undefined
})

// ── Tabs ──────────────────────────────────────────────────────────────────────

const activeTab = ref<'input' | 'result' | 'config'>('result')

watch(activeNode, (node) => {
  if (!node) return
  const stepsWithInput = ['PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION']
  activeTab.value = node.stepType === 'MARKET_SCANNING' ? 'config' : stepsWithInput.includes(node.stepType) ? 'input' : 'result'
  if (node.stepType === 'PARTNER_PROFILING' && pl) pl.initStep3Selection?.()
  else if (node.stepType === 'VALUE_ALIGNMENT' && pl) pl.initStep4Selection?.()
  else if (node.stepType === 'OUTREACH_PREPARATION' && pl) pl.initStep5Selection?.()
  expandedSources.value = new Set()
  activeAddPanel.value = null
  configSubSection.value = 'run'
  editingRefId.value = null
  expandedCardIdx.value = null
  // Pre-load PI records for cross-pipeline indicator in steps 3-6
  if (['PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION'].includes(node.stepType)) {
    if (piStepId.value && !canvas.stepRecords.value[piStepId.value]) {
      canvas.fetchStepRecords(piStepId.value)
    }
  }
})
watch(activeEdgeId, (id) => { if (id) activeTab.value = 'result' })

// ── Vstup (PI input from MS) ──────────────────────────────────────────────────

const msNode   = computed(() => canvas.nodes.value.find(n => n.data.stepType === 'MARKET_SCANNING'))
const msStepId = computed(() => msNode.value?.data.stepId ?? null)
const msRecords = computed<StepRecord[]>(() =>
  msStepId.value ? canvas.stepRecords.value[msStepId.value] ?? [] : []
)
const msRecordsLoading = computed(() => msStepId.value ? canvas.stepRecordsLoading.value[msStepId.value] : false)

watch(activeTab, (tab) => {
  if (tab === 'input' && msStepId.value && !canvas.stepRecords.value[msStepId.value]) {
    canvas.fetchStepRecords(msStepId.value)
  }
}, { immediate: true })

interface InputSourceGroup {
  key: string
  source: StepRecord['inputSource']
  records: StepRecord[]
  selectedCount: number
}

const msSourceGroups = computed((): InputSourceGroup[] => {
  const map = new Map<string, InputSourceGroup>()
  for (const rec of msRecords.value) {
    const key = rec.inputSource?.id ?? 'legacy'
    if (!map.has(key)) map.set(key, { key, source: rec.inputSource ?? null, records: [], selectedCount: 0 })
    const g = map.get(key)!
    g.records.push(rec)
    if (rec.isSelectedForProcessing) g.selectedCount++
  }
  return [...map.values()].sort((a, b) =>
    (b.records[0]?.addedAt ?? '').localeCompare(a.records[0]?.addedAt ?? '')
  )
})

const msExpandedGroups = ref(new Set<string>())

watch(msSourceGroups, (groups) => {
  if (groups.length === 1 && msExpandedGroups.value.size === 0) {
    msExpandedGroups.value = new Set([groups[0].key])
  }
}, { immediate: true })

function toggleMsGroup(key: string) {
  const s = new Set(msExpandedGroups.value)
  s.has(key) ? s.delete(key) : s.add(key)
  msExpandedGroups.value = s
}

async function toggleMsSel(refId: string, val: boolean) {
  if (!msStepId.value) return
  await canvas.toggleSelection(refId, val, msStepId.value)
}

async function selectAllInGroup(group: InputSourceGroup, val: boolean) {
  for (const rec of group.records) await toggleMsSel(rec.id, val)
}

const msTotalSelected = computed(() => msRecords.value.filter(r => r.isSelectedForProcessing).length)

// ── Steps 3-6: output-data based rendering ────────────────────────────────────

const isOutputStep = computed(() =>
  ['PARTNER_PROFILING', 'VALUE_ALIGNMENT', 'OUTREACH_PREPARATION', 'OUTREACH_EXECUTION'].includes(stepType.value ?? '')
)

// PI records for cross-pipeline indicator (loaded lazily when step 3-6 opens)
const piNode = computed(() => canvas.nodes.value.find(n => n.data.stepType === 'PARTNER_IDENTIFICATION'))
const piStepId = computed(() => piNode.value?.data.stepId ?? null)
const piRecords = computed<StepRecord[]>(() =>
  piStepId.value ? canvas.stepRecords.value[piStepId.value] ?? [] : []
)
const piPartnerMap = computed(() => {
  const map = new Map<string, number>()
  for (const rec of piRecords.value) {
    const key = rec.globalRecord.canonicalName.toLowerCase().trim()
    const count = new Set(rec.globalRecord.pipelineRefs.map(r => r.pipelineRunId)).size || 1
    map.set(key, Math.max(map.get(key) ?? 0, count))
  }
  return map
})
function partnerRunCount(name: string): number {
  return piPartnerMap.value.get(name.toLowerCase().trim()) ?? 0
}

// Step outputData accessed through pipeline composable (cast for simplicity)
const pipelineCtx = pipeline as unknown as {
  profilingOutputProfiles: (k: string) => Array<Record<string, unknown>>
  alignmentOutputAlignments: (k: string) => Array<Record<string, unknown>>
  outreachEmails: () => Array<Record<string, unknown>>
  getStepResult: (k: string) => { outputData?: unknown } | undefined
} | undefined

const ppProfiles = computed((): Array<Record<string, unknown>> => {
  if (stepType.value !== 'PARTNER_PROFILING' || !pipelineCtx) return []
  return pipelineCtx.profilingOutputProfiles('PARTNER_PROFILING') ?? []
})
const vaAlignments = computed((): Array<Record<string, unknown>> => {
  if (stepType.value !== 'VALUE_ALIGNMENT' || !pipelineCtx) return []
  return pipelineCtx.alignmentOutputAlignments('VALUE_ALIGNMENT') ?? []
})
const opEmails = computed((): Array<Record<string, unknown>> => {
  if (stepType.value !== 'OUTREACH_PREPARATION' || !pipelineCtx) return []
  return pipelineCtx.outreachEmails() ?? []
})
const oeResult = computed((): Record<string, unknown> | null => {
  if (stepType.value !== 'OUTREACH_EXECUTION' || !pipelineCtx) return null
  const d = pipelineCtx.getStepResult('OUTREACH_EXECUTION')?.outputData
  return (d && typeof d === 'object' && !Array.isArray(d)) ? d as Record<string, unknown> : null
})

function getStr(obj: Record<string, unknown>, key: string): string {
  return String(obj[key] ?? '')
}
function getArr(obj: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const v = obj[key]; return Array.isArray(v) ? v as Array<Record<string, unknown>> : []
}
function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key]; return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {}
}

// ── Step 3-6: input selection via legacy composable ───────────────────────────

const pl = pipeline as unknown as {
  step3FilteredCandidates: () => Array<{ partnerId: string; name: string; frequency: number; itemNames: string[] }>
  step3SelectedIds: Record<string, boolean>
  initStep3Selection: () => void
  step3SelectAll: () => void
  step3DeselectAll: () => void
  step3SelectUnprocessed: () => void
  step3SelectedCount: () => number
  step4Partners: () => Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }>
  step4SelectedIds: Record<string, boolean>
  initStep4Selection: () => void
  step4SelectAll: () => void
  step4DeselectAll: () => void
  step4SelectUnprocessed: () => void
  step4SelectedCount: () => number
  step5Alignments: () => Array<Record<string, unknown>>
  step5SelectedIds: Record<string, boolean>
  initStep5Selection: () => void
  step5SelectAll: () => void
  step5DeselectAll: () => void
  step5SelectedCount: () => number
  outreachEmails: () => Array<Record<string, unknown>>
} | undefined

const s3Candidates = computed(() =>
  stepType.value === 'PARTNER_PROFILING' && pl ? (pl.step3FilteredCandidates?.() ?? []) : []
)
const s4Partners = computed(() =>
  stepType.value === 'VALUE_ALIGNMENT' && pl ? (pl.step4Partners?.() ?? []) : []
)
const s5Alignments = computed(() =>
  stepType.value === 'OUTREACH_PREPARATION' && pl ? (pl.step5Alignments?.() ?? []) : []
)
const s6Emails = computed(() =>
  stepType.value === 'OUTREACH_EXECUTION' && pl ? (pl.outreachEmails?.() ?? []) : []
)

const processedNames = computed(() => {
  const set = new Set<string>()
  if (stepType.value === 'PARTNER_PROFILING')
    for (const p of ppProfiles.value) { const n = getStr(p, 'name'); if (n) set.add(n.toLowerCase()) }
  else if (stepType.value === 'VALUE_ALIGNMENT')
    for (const a of vaAlignments.value) { const n = getStr(a, 'name') || getStr(a, 'partnerName'); if (n) set.add(n.toLowerCase()) }
  else if (stepType.value === 'OUTREACH_PREPARATION')
    for (const e of opEmails.value) { const n = getStr(e, 'partnerName') || getStr(e, 'name'); if (n) set.add(n.toLowerCase()) }
  return set
})
function isProcessed(name: string) { return processedNames.value.has(name.toLowerCase().trim()) }
function toggleS3(partnerId: string, val: boolean) { if (pl) pl.step3SelectedIds[partnerId] = val }
function toggleS4(name: string, val: boolean) { if (pl) pl.step4SelectedIds[name] = val }
function toggleS5(name: string, val: boolean) { if (pl) pl.step5SelectedIds[name] = val }

const inputTabLabel = computed(() => {
  if (stepType.value === 'PARTNER_IDENTIFICATION')
    return msRecords.value.length > 0 ? `Vstup (${msTotalSelected.value}/${msRecords.value.length})` : 'Vstup'
  if (stepType.value === 'PARTNER_PROFILING')
    return s3Candidates.value.length > 0 ? `Vstup (${pl?.step3SelectedCount?.() ?? 0}/${s3Candidates.value.length})` : 'Vstup'
  if (stepType.value === 'VALUE_ALIGNMENT')
    return s4Partners.value.length > 0 ? `Vstup (${pl?.step4SelectedCount?.() ?? 0}/${s4Partners.value.length})` : 'Vstup'
  if (stepType.value === 'OUTREACH_PREPARATION')
    return s5Alignments.value.length > 0 ? `Vstup (${pl?.step5SelectedCount?.() ?? 0}/${s5Alignments.value.length})` : 'Vstup'
  return s6Emails.value.length > 0 ? `Vstup (${s6Emails.value.length})` : 'Vstup'
})

const resultTabLabel = computed(() => {
  if (stepType.value === 'PARTNER_PROFILING') return ppProfiles.value.length > 0 ? `Výsledek (${ppProfiles.value.length})` : 'Výsledek'
  if (stepType.value === 'VALUE_ALIGNMENT') return vaAlignments.value.length > 0 ? `Výsledek (${vaAlignments.value.length})` : 'Výsledek'
  if (stepType.value === 'OUTREACH_PREPARATION') return opEmails.value.length > 0 ? `Výsledek (${opEmails.value.length})` : 'Výsledek'
  if (stepType.value === 'OUTREACH_EXECUTION') return oeResult.value ? 'Výsledek (1)' : 'Výsledek'
  return totalRecords.value > 0 ? `Výsledek (${totalRecords.value})` : 'Výsledek'
})

const SIZE_LABELS: Record<string, string> = {
  micro: '<10', small: '10–50', medium: '50–500', large: '500–5k', enterprise: '>5k',
}
const CONTACT_TYPE_COLORS: Record<string, string> = {
  PR: 'bg-blue-100 text-blue-700', HR: 'bg-purple-100 text-purple-700',
  Marketing: 'bg-orange-100 text-orange-700', CEO: 'bg-red-100 text-red-700',
  General: 'bg-gray-100 text-gray-600',
}
const CONFIDENCE_COLORS: Record<string, string> = {
  High: 'text-green-600', Medium: 'text-amber-600', Low: 'text-red-400',
}

const expandedCardIdx = ref<number | null>(null)
function toggleCard(i: number) {
  expandedCardIdx.value = expandedCardIdx.value === i ? null : i
}

// ── Source-grouped records ────────────────────────────────────────────────────

interface SourcePanel {
  key: string
  source: StepRecord['inputSource']
  records: StepRecord[]
  relevant: number
  uncertain: number
  irrelevant: number
}

const allRecords = computed(() =>
  stepId.value ? canvas.stepRecords.value[stepId.value] ?? [] : []
)

const sourcePanels = computed((): SourcePanel[] => {
  const map = new Map<string, SourcePanel>()
  for (const rec of allRecords.value) {
    const key = rec.inputSource?.id ?? 'legacy'
    if (!map.has(key)) {
      map.set(key, { key, source: rec.inputSource ?? null, records: [], relevant: 0, uncertain: 0, irrelevant: 0 })
    }
    const p = map.get(key)!
    p.records.push(rec)
    if (rec.globalRecord.relevanceStatus === 'RELEVANT') p.relevant++
    else if (rec.globalRecord.relevanceStatus === 'IRRELEVANT') p.irrelevant++
    else p.uncertain++
  }
  return [...map.values()].sort((a, b) =>
    (b.records[0]?.addedAt ?? '').localeCompare(a.records[0]?.addedAt ?? '')
  )
})

const expandedSources = ref(new Set<string>())

watch(sourcePanels, (panels) => {
  if (panels.length === 1 && expandedSources.value.size === 0) {
    expandedSources.value = new Set([panels[0].key])
  }
}, { immediate: true })

watch(() => canvas.activeSourceFilter.value, (id) => {
  if (id) expandedSources.value = new Set([id])
})

function toggleExpand(key: string) {
  const s = new Set(expandedSources.value)
  s.has(key) ? s.delete(key) : s.add(key)
  expandedSources.value = s
}

// ── Filters ───────────────────────────────────────────────────────────────────

const statusFilter = ref('')
const searchFilter = ref('')

function panelRecords(panel: SourcePanel): StepRecord[] {
  const filtered = panel.records.filter(r => {
    if (statusFilter.value && r.globalRecord.relevanceStatus !== statusFilter.value) return false
    if (searchFilter.value) {
      const q = searchFilter.value.toLowerCase()
      if (!r.globalRecord.canonicalName.toLowerCase().includes(q)) return false
    }
    return true
  })
  if (stepType.value === 'PARTNER_IDENTIFICATION') {
    return [...filtered].sort((a, b) =>
      piPartnerSources(b.globalRecord.canonicalName).length - piPartnerSources(a.globalRecord.canonicalName).length
    )
  }
  return filtered
}

// ── Source type config ────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  MINI_DEEP_RESEARCH: { label: 'AI Výsledek', cls: 'bg-blue-100 text-blue-700' },
  AI_IMPORT:          { label: 'AI Import',   cls: 'bg-purple-100 text-purple-700' },
  MANUAL_ADD:         { label: 'Ručně',        cls: 'bg-gray-100 text-gray-600' },
  GLOBAL_DB_SELECT:   { label: 'Z databáze',  cls: 'bg-indigo-100 text-indigo-600' },
  legacy:             { label: 'Legacy',       cls: 'bg-amber-100 text-amber-700' },
}
function sourceConfig(type?: string | null) {
  return SOURCE_CONFIG[type ?? 'legacy'] ?? SOURCE_CONFIG.legacy
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  RELEVANT:   'bg-green-100 text-green-700',
  IRRELEVANT: 'bg-gray-100 text-gray-500',
  UNCERTAIN:  'bg-amber-100 text-amber-700',
}
const STATUS_LABELS: Record<string, string> = {
  RELEVANT:   'Relevantní',
  IRRELEVANT: 'Irelevantní',
  UNCERTAIN:  'Nejistý',
}

const isLegacyRef = (r: { id: string }) => r.id.startsWith('legacy-')

// PI partner payload helper
function piPayload(rec: StepRecord) {
  return rec.globalRecord.payload as Record<string, string>
}

function piPipelineCount(rec: StepRecord): number {
  return new Set(rec.globalRecord.pipelineRefs.map(r => r.pipelineRunId)).size || 1
}

function recordProvenance(rec: StepRecord): string {
  const parts: string[] = []
  if (rec.adder?.name) parts.push(`Přidal: ${rec.adder.name}`)
  const pipelineCount = new Set(rec.globalRecord.pipelineRefs.map(r => r.pipelineRunId)).size
  if (pipelineCount > 1) parts.push(`${pipelineCount}× pipeline`)
  return parts.join(' · ')
}

// PI: derive processed competitions and partner source map from step outputData
const piOutputItems = computed(() => {
  const data = pipelineCtx?.getStepResult?.('PARTNER_IDENTIFICATION')?.outputData as { items?: unknown[] } | null
  return (data?.items ?? []) as Array<{ itemName: string; partners: Array<{ name: string }> }>
})
const piProcessedItemNames = computed(() => {
  const s = new Set<string>()
  for (const item of piOutputItems.value) if (item.itemName) s.add(item.itemName.toLowerCase().trim())
  return s
})
const piPartnerSourceMap = computed(() => {
  const map = new Map<string, string[]>()
  for (const item of piOutputItems.value) {
    for (const p of (item.partners ?? [])) {
      const key = (p.name ?? '').toLowerCase().trim()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item.itemName)
    }
  }
  return map
})
function piPartnerSources(name: string): string[] {
  return piPartnerSourceMap.value.get(name.toLowerCase().trim()) ?? []
}

// MS competition payload helpers
const LEVEL_LABELS: Record<string, string> = {
  school: 'Školní', regional: 'Regionální', national: 'Národní', international: 'Mezinárodní',
}
const COMP_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-600', inactive: 'bg-gray-100 text-gray-400', uncertain: 'bg-amber-50 text-amber-600',
}
const COMP_STATUS_LABELS: Record<string, string> = {
  active: 'Aktivní', inactive: 'Neaktivní', uncertain: 'Nejistý',
}
function msPayload(rec: StepRecord) {
  return rec.globalRecord.payload as Record<string, string>
}

async function setStatus(rec: StepRecord, status: string) {
  if (isLegacyRef(rec)) return
  await canvas.setRelevanceStatus(rec.globalRecord.id, status)
}

async function toggleSel(refId: string, val: boolean) {
  if (!stepId.value || refId.startsWith('legacy-')) return
  await canvas.toggleSelection(refId, val, stepId.value)
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteRecord(rec: StepRecord) {
  if (isLegacyRef(rec) || !stepId.value) return
  await canvas.removeRecord(stepId.value, rec.id)
}

async function deleteUnselected(sourceKey: string) {
  if (!stepId.value) return
  const panel = sourcePanels.value.find(p => p.key === sourceKey)
  if (!panel) return
  for (const rec of [...panel.records]) {
    if (!rec.isSelectedForProcessing && !isLegacyRef(rec)) {
      await canvas.removeRecord(stepId.value, rec.id)
    }
  }
}

// ── Edit record ───────────────────────────────────────────────────────────────

const editingRefId = ref<string | null>(null)
const editSaving = ref(false)

// Shared field
const editName = ref('')

// Shared / PI partner fields
const editDescription = ref('')
const editIndustry    = ref('')

// MS competition fields (payload)
const editUrl         = ref('')
const editType        = ref('')
const editLevel       = ref('')
const editTargetGroup = ref('')
const editOrganizer   = ref('')
const editFrequency   = ref('')
const editCompStatus  = ref('')

const MS_LEVEL_OPTIONS    = ['school', 'regional', 'national', 'international']
const MS_FREQ_OPTIONS     = ['ročně', 'nepravidelně', 'unknown']
const MS_STATUS_OPTIONS   = ['active', 'inactive', 'uncertain']

function startEdit(rec: StepRecord) {
  const p = rec.globalRecord.payload as Record<string, string>
  editingRefId.value = rec.id
  editName.value        = rec.globalRecord.canonicalName
  editUrl.value         = p.url ?? p.website ?? ''
  editDescription.value = p.description ?? ''
  editIndustry.value    = p.industry ?? p.type ?? ''
  // MS-specific
  editType.value        = p.type         ?? ''
  editLevel.value       = p.level        ?? ''
  editTargetGroup.value = p.target_group ?? ''
  editOrganizer.value   = p.organizer    ?? ''
  editFrequency.value   = p.frequency    ?? ''
  editCompStatus.value  = p.status       ?? ''
}

function cancelEdit() {
  editingRefId.value = null
}

async function saveEdit(rec: StepRecord) {
  if (!editName.value.trim()) return
  editSaving.value = true
  try {
    const isMS = stepType.value === 'MARKET_SCANNING'
    const isPI = stepType.value === 'PARTNER_IDENTIFICATION'
    await canvas.updateRecord(rec.globalRecord.id, {
      canonicalName: editName.value,
      payload: isMS ? {
        url:          editUrl.value         || null,
        type:         editType.value        || null,
        level:        editLevel.value       || null,
        target_group: editTargetGroup.value || null,
        organizer:    editOrganizer.value   || null,
        description:  editDescription.value || null,
        frequency:    editFrequency.value   || null,
        status:       editCompStatus.value  || null,
      } : isPI ? {
        website:     editUrl.value         || null,
        description: editDescription.value || null,
        industry:    editIndustry.value    || null,
      } : { url: editUrl.value || null },
    })
    editingRefId.value = null
  } finally {
    editSaving.value = false
  }
}

// ── Select all / unselected delete ───────────────────────────────────────────

async function selectAllInSource(key: string, val: boolean) {
  const panel = sourcePanels.value.find(p => p.key === key)
  if (!panel || !stepId.value) return
  for (const rec of panel.records) {
    if (!isLegacyRef(rec)) await canvas.toggleSelection(rec.id, val, stepId.value)
  }
}

// ── Add data panels ───────────────────────────────────────────────────────────

type AddPanel = 'import' | 'db' | 'manual' | null
const activeAddPanel = ref<AddPanel>(null)
const configSubSection = ref<'run' | 'import' | 'db'>('run')

// Import
const importText    = ref('')
const importLoading = ref(false)
const importError   = ref('')

async function doImport() {
  if (!importText.value.trim() || !stepType.value) return
  importLoading.value = true
  importError.value = ''
  try {
    await canvas.importAI(stepId.value ?? '', stepType.value, importText.value)
    importText.value = ''
    activeAddPanel.value = null
    configSubSection.value = 'run'
  } catch (e: unknown) {
    importError.value = (e as { message?: string })?.message ?? 'Chyba importu'
  } finally {
    importLoading.value = false
  }
}

// Manual add
const manualName    = ref('')
const manualUrl     = ref('')
const manualLoading = ref(false)
const manualError   = ref('')

// Auto-set type based on step
const manualType = computed(() => stepRecordType.value ?? 'COMPETITION')

async function doManual() {
  if (!manualName.value.trim() || !stepId.value) return
  manualLoading.value = true
  manualError.value = ''
  try {
    await canvas.addManualRecord(stepId.value, manualName.value, manualUrl.value || undefined, manualType.value)
    manualName.value = ''
    manualUrl.value = ''
    activeAddPanel.value = null
  } catch (e: unknown) {
    manualError.value = (e as { message?: string })?.message ?? 'Chyba'
  } finally {
    manualLoading.value = false
  }
}

// DB / AI search
type DbMode = 'text' | 'ai'
const dbMode         = ref<DbMode>('text')
const dbQuery        = ref('')
const dbResults      = ref<Array<{ id: string; canonicalName: string; type: string; relevanceStatus: string }>>([])
const dbLoading      = ref(false)
const dbSelectedIds  = ref(new Set<string>())
const dbOffset       = ref(0)
const dbTotal        = ref(0)
const dbStatusFilter = ref('')
const DB_PAGE_SIZE   = 20

const dbTotalPages = computed(() => Math.ceil(dbTotal.value / DB_PAGE_SIZE))

function resetDbState() {
  dbQuery.value = ''
  dbResults.value = []
  dbSelectedIds.value = new Set()
  dbOffset.value = 0
  dbTotal.value = 0
  dbStatusFilter.value = ''
}

watch(activeAddPanel, (p) => {
  if (p !== 'db') resetDbState()
  else doDbSearch()
})

watch(configSubSection, (s) => {
  if (s === 'db') doDbSearch()
  else resetDbState()
})

async function doDbSearch() {
  dbLoading.value = true
  try {
    if (dbMode.value === 'ai' && stepId.value) {
      dbResults.value = await canvas.aiSuggestRecords(stepId.value, dbQuery.value, stepRecordType.value)
      dbTotal.value = dbResults.value.length
    } else {
      type DbResp = { records: typeof dbResults.value; total: number } | typeof dbResults.value
      const resp = await $fetch<DbResp>('/api/records', {
        query: {
          search: dbQuery.value,
          limit: DB_PAGE_SIZE,
          offset: dbOffset.value,
          withCount: 'true',
          ...(stepRecordType.value ? { type: stepRecordType.value } : {}),
          ...(dbStatusFilter.value ? { status: dbStatusFilter.value } : {}),
        },
      })
      const alreadyAdded = new Set(allRecords.value.map(r => r.globalRecord.id))
      if (resp && !Array.isArray(resp) && 'records' in resp) {
        dbResults.value = (resp.records ?? []).filter((r: { id: string }) => !alreadyAdded.has(r.id))
        dbTotal.value = resp.total ?? 0
      } else {
        dbResults.value = (resp as typeof dbResults.value).filter((r) => !alreadyAdded.has(r.id))
        dbTotal.value = dbResults.value.length
      }
    }
  } finally {
    dbLoading.value = false
  }
}

function dbSelectAll() {
  const s = new Set(dbSelectedIds.value)
  for (const r of dbResults.value) s.add(r.id)
  dbSelectedIds.value = s
}

function dbDeselectAll() {
  dbSelectedIds.value = new Set()
}

async function handleDbInput() {
  if (dbMode.value !== 'text') return
  dbOffset.value = 0
  await doDbSearch()
}

watch(dbStatusFilter, () => {
  dbOffset.value = 0
  doDbSearch()
})

function dbPrevPage() {
  if (dbOffset.value === 0) return
  dbOffset.value = Math.max(0, dbOffset.value - DB_PAGE_SIZE)
  doDbSearch()
}

function dbNextPage() {
  if (dbOffset.value + DB_PAGE_SIZE >= dbTotal.value) return
  dbOffset.value += DB_PAGE_SIZE
  doDbSearch()
}

function toggleDbSelect(id: string) {
  const s = new Set(dbSelectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  dbSelectedIds.value = s
}

async function addSingle(id: string) {
  if (!stepId.value) return
  await canvas.addFromGlobalDB(stepId.value, id)
  dbResults.value = dbResults.value.filter(r => r.id !== id)
}

async function addDbSelected() {
  if (!stepId.value) return
  for (const id of dbSelectedIds.value) await canvas.addFromGlobalDB(stepId.value, id)
  dbSelectedIds.value = new Set()
  activeAddPanel.value = null
  configSubSection.value = 'run'
}

// ── Edge detail + donut chart ─────────────────────────────────────────────────

const SOURCE_HEX: Record<string, string> = {
  MINI_DEEP_RESEARCH: '#6366f1',
  AI_IMPORT:          '#a855f7',
  MANUAL_ADD:         '#9ca3af',
  GLOBAL_DB_SELECT:   '#4f46e5',
  legacy:             '#f59e0b',
}

const DONUT_C = 2 * Math.PI * 36  // circumference for r=36

interface DonutSegment {
  key: string; label: string; color: string
  count: number; total: number
  dash: number; gap: number; offset: number
}

const edgeChartData = computed(() => {
  if (!edgeDetail.value) return null
  const recs = edgeDetail.value.sourceRecords
  const total = recs.length
  if (total === 0) return null

  const groups = new Map<string, { key: string; label: string; type: string; selected: number; all: number }>()
  for (const rec of recs) {
    const key = rec.inputSource?.id ?? 'legacy'
    if (!groups.has(key)) groups.set(key, { key, label: rec.inputSource?.label ?? 'Legacy', type: rec.inputSource?.type ?? 'legacy', selected: 0, all: 0 })
    const g = groups.get(key)!
    g.all++
    if (rec.isSelectedForProcessing) g.selected++
  }

  const totalSelected = recs.filter(r => r.isSelectedForProcessing).length
  const segments: DonutSegment[] = []
  let cumulative = 0

  for (const g of groups.values()) {
    if (g.selected === 0) continue
    const dash = (g.selected / total) * DONUT_C
    segments.push({ key: g.key, label: g.label, color: SOURCE_HEX[g.type] ?? '#6366f1', count: g.selected, total: g.all, dash, gap: DONUT_C - dash, offset: DONUT_C - cumulative })
    cumulative += dash
  }
  const unselected = total - totalSelected
  if (unselected > 0) {
    const dash = (unselected / total) * DONUT_C
    segments.push({ key: '__unselected', label: 'Nevybráno', color: '#e5e7eb', count: unselected, total: unselected, dash, gap: DONUT_C - dash, offset: DONUT_C - cumulative })
  }

  return { segments, totalSelected, total }
})

const edgeDetail = computed(() => {
  if (!activeEdgeId.value) return null
  const edge = canvas.edges.value.find(e => e.id === activeEdgeId.value)
  if (!edge) return null
  const sourceNode = canvas.nodes.value.find(n => n.id === edge.source)
  const sid = sourceNode?.data.stepId as string | null
  const sourceRecords = sid ? (canvas.stepRecords.value[sid] ?? []) : []
  return { edge, sourceNode, sourceRecords }
})

watch(activeEdgeId, async (id) => {
  if (!id) return
  const edge = canvas.edges.value.find(e => e.id === id)
  if (!edge) return
  const sourceNode = canvas.nodes.value.find(n => n.id === edge.source)
  const sid = sourceNode?.data.stepId as string | null
  if (sid && !canvas.stepRecords.value[sid]) await canvas.fetchStepRecords(sid)
})

// ── Misc ──────────────────────────────────────────────────────────────────────

const recordsLoading = computed(() => stepId.value ? canvas.stepRecordsLoading.value[stepId.value] : false)
const totalRecords   = computed(() => allRecords.value.length)

const STEP_LABELS: Record<string, string> = {
  MARKET_SCANNING:        'Market Scanning',
  PARTNER_IDENTIFICATION: 'Identifikace partnerů',
  PARTNER_PROFILING:      'Profilování partnerů',
  VALUE_ALIGNMENT:        'Value Alignment',
  OUTREACH_PREPARATION:   'Příprava oslovení',
  OUTREACH_EXECUTION:     'Odeslání oslovení',
}

const overlayTitle = computed(() => {
  if (activeEdgeId.value) return edgeDetail.value?.edge.label ? `Tok: ${edgeDetail.value.edge.label}` : 'Tok mezi kroky'
  return stepType.value ? STEP_LABELS[stepType.value] ?? stepType.value : ''
})

const modelBadge = computed(() => {
  if (!stepType.value) return null
  const model = STEP_MODEL[stepType.value]
  return model ? MODEL_BADGE[model] ?? null : null
})

// ── Auto-refresh canvas after step execution ──────────────────────────────────
// Watch executingStep: fires whenever any step finishes (regardless of overlay state)
watch(() => pipeline?.executingStep, (newVal, oldVal) => {
  if (oldVal !== null && oldVal !== undefined && newVal === null) {
    canvas.fetchCanvasData()
  }
})

function renderLinks(text: string): string {
  if (!text) return ''
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-500 underline hover:opacity-80">$1</a>')
}
</script>

<template>
  <Transition name="overlay">
    <div
      v-if="isOpen"
      class="fixed right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col"
      style="width: 620px"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <h2 class="text-sm font-semibold text-gray-800 truncate">{{ overlayTitle }}</h2>
          <span v-if="modelBadge" :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', modelBadge.cls]">{{ modelBadge.label }}</span>
        </div>
        <button class="text-gray-400 hover:text-gray-600 transition-colors ml-4 flex-shrink-0" @click="canvas.closeOverlay()">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <!-- Tabs -->
      <div v-if="activeNode && !activeEdgeId" class="flex border-b border-gray-100 flex-shrink-0">
        <template v-if="stepType === 'PARTNER_IDENTIFICATION' || isOutputStep">
          <button
            v-for="tab in ([
              { key: 'input',  label: inputTabLabel },
              { key: 'config', label: 'Konfigurace' },
              { key: 'result', label: resultTabLabel },
            ] as const)"
            :key="tab.key"
            :class="['px-5 py-2.5 text-xs font-medium border-b-2 transition-colors', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="activeTab = tab.key"
          >{{ tab.label }}</button>
        </template>
        <template v-else>
          <button
            v-for="tab in ([
              { key: 'config', label: 'Konfigurace' },
              { key: 'result', label: totalRecords > 0 ? `Výsledek (${totalRecords})` : 'Výsledek' },
            ] as const)"
            :key="tab.key"
            :class="['px-5 py-2.5 text-xs font-medium border-b-2 transition-colors', activeTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="activeTab = tab.key"
          >{{ tab.label }}</button>
        </template>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto min-h-0">

        <!-- ── Edge detail: donut chart ── -->
        <template v-if="activeEdgeId && edgeDetail">
          <div class="p-6 flex flex-col items-center gap-6">
            <p class="text-xs text-gray-400 self-start">
              Složení vstupu z <strong class="text-gray-600">{{ edgeDetail.sourceNode?.data.label }}</strong>
            </p>

            <div v-if="!edgeChartData" class="text-sm text-gray-400 py-8">Žádné záznamy</div>
            <template v-else>
              <!-- Donut -->
              <div class="relative flex-shrink-0">
                <svg viewBox="0 0 100 100" class="w-44 h-44 -rotate-90">
                  <circle cx="50" cy="50" r="36" fill="none" stroke="#f3f4f6" stroke-width="20" />
                  <circle
                    v-for="seg in edgeChartData.segments"
                    :key="seg.key"
                    cx="50" cy="50" r="36" fill="none"
                    :stroke="seg.color"
                    stroke-width="20"
                    :stroke-dasharray="`${seg.dash} ${seg.gap}`"
                    :stroke-dashoffset="seg.offset"
                  />
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span class="text-2xl font-bold text-gray-800">{{ edgeChartData.totalSelected }}</span>
                  <span class="text-xs text-gray-400">z {{ edgeChartData.total }}</span>
                </div>
              </div>

              <!-- Legend -->
              <div class="w-full space-y-2">
                <div v-for="seg in edgeChartData.segments" :key="seg.key" class="flex items-center gap-3">
                  <div class="w-3 h-3 rounded-sm flex-shrink-0" :style="{ backgroundColor: seg.color }" />
                  <span class="text-xs text-gray-700 flex-1 truncate">{{ seg.label }}</span>
                  <span class="text-xs font-medium text-gray-500">{{ seg.count }}</span>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- ── Vstup tab ── -->
        <template v-else-if="activeTab === 'input'">

          <!-- PI (step 2): MS record selection -->
          <template v-if="stepType === 'PARTNER_IDENTIFICATION'">
            <div v-if="msRecordsLoading" class="flex items-center justify-center h-32 text-gray-400 text-sm">Načítám...</div>
            <div v-else-if="msSourceGroups.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
              <span class="text-3xl opacity-50">📭</span>
              <span>Krok 1 zatím nemá žádné záznamy.</span>
            </div>
            <div v-else>
              <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span class="text-xs text-gray-500">
                  <span class="font-semibold text-gray-800">{{ msTotalSelected }}</span> z {{ msRecords.length }} vybráno pro zpracování
                </span>
              </div>
              <div
                v-for="group in msSourceGroups"
                :key="group.key"
                class="border-b border-gray-100 last:border-b-0"
              >
                <button
                  class="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                  @click="toggleMsGroup(group.key)"
                >
                  <span :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', sourceConfig(group.source?.type).cls]">
                    {{ sourceConfig(group.source?.type).label }}
                  </span>
                  <span class="flex-1 text-sm text-gray-700 truncate">{{ group.source?.label ?? 'Legacy data' }}</span>
                  <NuxtLink
                    v-if="group.source?.pipelineRunId && group.source.pipelineRunId !== currentRunId"
                    :to="`/pipeline/${group.source.pipelineRunId}`"
                    class="text-xs text-indigo-500 hover:text-indigo-700 underline flex-shrink-0"
                    @click.stop
                  >↗ Zobrazit</NuxtLink>
                  <span class="text-xs text-gray-400 flex-shrink-0">{{ group.selectedCount }}/{{ group.records.length }}</span>
                  <svg
                    class="w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-150"
                    :class="msExpandedGroups.has(group.key) ? 'rotate-180' : ''"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-if="msExpandedGroups.has(group.key)">
                  <div class="px-5 py-1.5 flex items-center gap-3 bg-gray-50/70 border-t border-gray-100">
                    <button class="text-xs text-indigo-600 hover:underline" @click="selectAllInGroup(group, true)">Vybrat vše</button>
                    <span class="text-gray-300">|</span>
                    <button class="text-xs text-gray-500 hover:underline" @click="selectAllInGroup(group, false)">Zrušit výběr</button>
                  </div>
                  <div class="divide-y divide-gray-50 border-t border-gray-100">
                    <div
                      v-for="rec in group.records"
                      :key="rec.id"
                      class="px-5 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        :checked="rec.isSelectedForProcessing"
                        :disabled="isLegacyRef(rec)"
                        class="rounded disabled:opacity-40 flex-shrink-0"
                        @change="toggleMsSel(rec.id, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="flex-1 text-sm text-gray-800 truncate">{{ rec.globalRecord.canonicalName }}</span>
                      <span
                        v-if="piProcessedItemNames.has(rec.globalRecord.canonicalName.toLowerCase().trim())"
                        class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium flex-shrink-0"
                      >✓ Zpracováno</span>
                      <a
                        v-if="(rec.globalRecord.payload as Record<string,string>).url"
                        :href="(rec.globalRecord.payload as Record<string,string>).url"
                        target="_blank" rel="noopener"
                        class="text-xs text-indigo-400 hover:text-indigo-600 flex-shrink-0"
                        @click.stop
                      >↗</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- PP (step 3): partner candidate selection -->
          <template v-else-if="stepType === 'PARTNER_PROFILING'">
            <div v-if="s3Candidates.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
              <span class="text-3xl opacity-50">📭</span>
              <span>Krok 2 zatím nemá žádné partnery.</span>
            </div>
            <div v-else>
              <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <span class="text-xs text-gray-500">
                  <span class="font-semibold text-gray-800">{{ pl?.step3SelectedCount?.() ?? 0 }}</span> z {{ s3Candidates.length }} vybráno
                </span>
                <div class="flex gap-2">
                  <button class="text-xs text-indigo-600 hover:underline" @click="pl?.step3SelectAll?.()">Vybrat vše</button>
                  <button class="text-xs text-gray-500 hover:underline" @click="pl?.step3SelectUnprocessed?.()">Jen nezpracované</button>
                  <button class="text-xs text-gray-400 hover:underline" @click="pl?.step3DeselectAll?.()">Zrušit vše</button>
                </div>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="c in s3Candidates"
                  :key="c.partnerId"
                  class="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="pl?.step3SelectedIds?.[c.partnerId] ?? false"
                    class="mt-0.5 rounded flex-shrink-0"
                    @change="toggleS3(c.partnerId, ($event.target as HTMLInputElement).checked)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span :class="['text-sm font-medium', isProcessed(c.name) ? 'text-green-800' : 'text-gray-800']">{{ c.name }}</span>
                      <span v-if="isProcessed(c.name)" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Hotovo</span>
                      <span v-if="partnerRunCount(c.name) > 1" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ partnerRunCount(c.name) }}× pipeline</span>
                    </div>
                    <div v-if="c.frequency > 1" class="text-xs text-gray-400 mt-0.5">Nalezen {{ c.frequency }}× ({{ c.itemNames.slice(0, 2).join(', ') }})</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- VA (step 4): profiled partner selection -->
          <template v-else-if="stepType === 'VALUE_ALIGNMENT'">
            <div v-if="s4Partners.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
              <span class="text-3xl opacity-50">📭</span>
              <span>Krok 3 zatím nemá žádné profily.</span>
            </div>
            <div v-else>
              <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <span class="text-xs text-gray-500">
                  <span class="font-semibold text-gray-800">{{ pl?.step4SelectedCount?.() ?? 0 }}</span> z {{ s4Partners.length }} vybráno
                </span>
                <div class="flex gap-2">
                  <button class="text-xs text-indigo-600 hover:underline" @click="pl?.step4SelectAll?.()">Vybrat vše</button>
                  <button class="text-xs text-gray-500 hover:underline" @click="pl?.step4SelectUnprocessed?.()">Jen nezpracované</button>
                  <button class="text-xs text-gray-400 hover:underline" @click="pl?.step4DeselectAll?.()">Zrušit vše</button>
                </div>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="p in s4Partners"
                  :key="p.name"
                  class="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="pl?.step4SelectedIds?.[p.name] ?? false"
                    class="mt-0.5 rounded flex-shrink-0"
                    @change="toggleS4(p.name, ($event.target as HTMLInputElement).checked)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span :class="['text-sm font-medium', isProcessed(p.name) ? 'text-green-800' : 'text-gray-800']">{{ p.name }}</span>
                      <span v-if="isProcessed(p.name)" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Hotovo</span>
                      <span v-if="p.industry" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ p.industry }}</span>
                      <span v-if="partnerRunCount(p.name) > 1" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ partnerRunCount(p.name) }}× pipeline</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <a v-if="p.website" :href="p.website" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
                      <a v-if="p.linkedinUrl" :href="p.linkedinUrl" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>in LinkedIn</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- OP (step 5): alignment selection -->
          <template v-else-if="stepType === 'OUTREACH_PREPARATION'">
            <div v-if="s5Alignments.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
              <span class="text-3xl opacity-50">📭</span>
              <span>Krok 4 zatím nemá žádné alignmenty.</span>
            </div>
            <div v-else>
              <div class="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <span class="text-xs text-gray-500">
                  <span class="font-semibold text-gray-800">{{ pl?.step5SelectedCount?.() ?? 0 }}</span> z {{ s5Alignments.length }} vybráno
                </span>
                <div class="flex gap-2">
                  <button class="text-xs text-indigo-600 hover:underline" @click="pl?.step5SelectAll?.()">Vybrat vše</button>
                  <button class="text-xs text-gray-400 hover:underline" @click="pl?.step5DeselectAll?.()">Zrušit vše</button>
                </div>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="a in s5Alignments"
                  :key="getStr(a, 'name') || getStr(a, 'partnerName')"
                  class="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    :checked="pl?.step5SelectedIds?.[getStr(a, 'name') || getStr(a, 'partnerName')] ?? false"
                    class="mt-0.5 rounded flex-shrink-0"
                    @change="toggleS5(getStr(a, 'name') || getStr(a, 'partnerName'), ($event.target as HTMLInputElement).checked)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span :class="['text-sm font-medium', isProcessed(getStr(a, 'name') || getStr(a, 'partnerName')) ? 'text-green-800' : 'text-gray-800']">{{ getStr(a, 'name') || getStr(a, 'partnerName') }}</span>
                      <span v-if="isProcessed(getStr(a, 'name') || getStr(a, 'partnerName'))" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Hotovo</span>
                      <span v-if="partnerRunCount(getStr(a, 'name') || getStr(a, 'partnerName')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ partnerRunCount(getStr(a, 'name') || getStr(a, 'partnerName')) }}× pipeline</span>
                    </div>
                    <p v-if="getStr(a, 'hookHypothesis')" class="text-xs text-gray-500 mt-0.5 line-clamp-1 italic">{{ getStr(a, 'hookHypothesis') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- OE (step 6): prepared emails overview -->
          <template v-else-if="stepType === 'OUTREACH_EXECUTION'">
            <div v-if="s6Emails.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
              <span class="text-3xl opacity-50">📭</span>
              <span>Krok 5 zatím nemá žádné e-maily.</span>
            </div>
            <div v-else>
              <div class="px-5 py-2.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">{{ s6Emails.length }} {{ s6Emails.length === 1 ? 'e-mail' : 'e-mailů' }} připraveno k odeslání</span>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="(email, i) in s6Emails"
                  :key="i"
                  class="px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span :class="['text-sm font-medium', oeResult ? 'text-green-800' : 'text-gray-800']">{{ getStr(email, 'partnerName') || getStr(email, 'name') }}</span>
                    <span v-if="oeResult" class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Odesláno</span>
                  </div>
                  <p v-if="getStr(getObj(email, 'email'), 'subject') || getStr(email, 'subject')" class="text-xs text-gray-500 mt-0.5 truncate">{{ getStr(getObj(email, 'email'), 'subject') || getStr(email, 'subject') }}</p>
                </div>
              </div>
              <p class="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">Příjemce a odeslání nastavte v záložce Konfigurace.</p>
            </div>
          </template>

        </template>

        <!-- ── Výsledek tab ── -->
        <template v-else-if="activeTab === 'result'">

          <!-- Sub-tabs / Add data buttons -->
          <div v-if="stepType !== 'MARKET_SCANNING'" class="px-5 py-3 border-b border-gray-100 flex gap-2 flex-wrap flex-shrink-0">
            <template v-if="!isOutputStep">
              <button
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === null ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="activeAddPanel = null"
              >Přehled</button>
              <button
                class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                @click="activeTab = 'config'"
              >▶ Spustit</button>
              <button
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'import' ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="activeAddPanel = 'import'"
              >↑ Importovat</button>
              <button
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'db' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="activeAddPanel = 'db'"
              >🔍 Z databáze</button>
              <button
                v-if="!['MARKET_SCANNING', 'PARTNER_IDENTIFICATION'].includes(stepType ?? '')"
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', activeAddPanel === 'manual' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="activeAddPanel = 'manual'"
              >+ Ručně</button>
            </template>
            <button
              v-else
              class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              @click="activeTab = 'input'"
            >▶ Spustit</button>
          </div>

          <!-- Import panel -->
          <div v-if="activeAddPanel === 'import'" class="px-5 py-4 border-b border-gray-100 bg-purple-50/40">
            <textarea
              v-model="importText"
              rows="6"
              placeholder="Vložte JSON nebo text k parsování..."
              class="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-purple-300 font-mono bg-white"
            />
            <p class="text-[10px] text-gray-400 mt-1.5">
              <template v-if="stepType === 'MARKET_SCANNING'">Očekávaný formát: [{ "name": "...", "url": "...", "type": "...", "level": "..." }] —</template>
              <template v-else-if="stepType === 'PARTNER_IDENTIFICATION'">Očekávaný formát: { "items": [{ "itemName": "...", "partners": [{ "name": "..." }] }] } —</template>
              Textový vstup je také v pořádku, AI ho automaticky parsuje.
            </p>
            <p v-if="importError" class="text-xs text-red-500 mt-1">{{ importError }}</p>
            <div class="flex gap-2 mt-2">
              <button
                :disabled="importLoading || !importText.trim()"
                class="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                @click="doImport()"
              >{{ importLoading ? 'Importuji...' : 'Importovat' }}</button>
              <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="activeAddPanel = null">Zrušit</button>
            </div>
          </div>

          <!-- DB / AI search panel -->
          <div v-if="activeAddPanel === 'db'" class="border-b border-gray-100 bg-indigo-50/20">
            <!-- Search + AI toggle -->
            <div class="px-5 pt-3 pb-2 flex items-center gap-2">
              <input
                v-model="dbQuery"
                type="text"
                :placeholder="dbMode === 'ai' ? 'Popište, co hledáte...' : 'Textové vyhledání...'"
                class="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                @input="handleDbInput()"
                @keyup.enter="doDbSearch()"
              />
              <button
                :class="['text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors', dbMode === 'ai' ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600']"
                @click="dbMode = dbMode === 'ai' ? 'text' : 'ai'; dbResults = []"
              >AI</button>
              <button
                v-if="dbMode === 'ai'"
                :disabled="dbLoading || !dbQuery.trim()"
                class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                @click="doDbSearch()"
              >{{ dbLoading ? '...' : 'Hledat' }}</button>
            </div>
            <!-- Status filter chips -->
            <div class="px-5 pb-2 flex items-center gap-1 flex-wrap">
              <button
                v-for="(label, key) in STATUS_LABELS"
                :key="key"
                :class="['text-xs px-2 py-0.5 rounded-full border transition-colors', dbStatusFilter === key ? STATUS_COLORS[key] + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
                @click="dbStatusFilter = dbStatusFilter === key ? '' : key"
              >{{ label }}</button>
            </div>
            <!-- Info row + select all -->
            <div class="px-5 pb-1 flex items-center justify-between">
              <p v-if="dbTotal > 0" class="text-xs text-gray-400">{{ dbTotal }} v databázi · {{ allRecords.length }} přidáno</p>
              <p v-else class="text-xs text-gray-400" />
              <div v-if="dbResults.length > 0" class="flex gap-2">
                <button class="text-xs text-indigo-600 hover:underline" @click="dbSelectAll()">Vybrat vše</button>
                <button v-if="dbSelectedIds.size > 0" class="text-xs text-gray-400 hover:underline" @click="dbDeselectAll()">Zrušit</button>
              </div>
            </div>
            <p v-if="dbMode === 'ai'" class="px-5 pb-2 text-xs text-gray-400">AI prohledá záznamy napříč ostatními pipeline</p>
            <!-- Results list -->
            <div class="max-h-52 overflow-y-auto border-t border-gray-100 divide-y divide-gray-50">
              <div v-if="dbLoading" class="px-5 py-3 text-xs text-gray-400">Hledám...</div>
              <template v-else>
                <div
                  v-for="rec in dbResults"
                  :key="rec.id"
                  class="px-5 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors"
                  @click="toggleDbSelect(rec.id)"
                >
                  <input type="checkbox" :checked="dbSelectedIds.has(rec.id)" class="rounded flex-shrink-0" @click.stop="toggleDbSelect(rec.id)" />
                  <span class="text-sm text-gray-800 flex-1 truncate">{{ rec.canonicalName }}</span>
                  <span :class="['text-xs px-1.5 py-0.5 rounded flex-shrink-0', STATUS_COLORS[rec.relevanceStatus] ?? 'bg-gray-50 text-gray-400']">{{ STATUS_LABELS[rec.relevanceStatus] ?? rec.relevanceStatus }}</span>
                </div>
                <div v-if="!dbLoading && dbResults.length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">Nic nenalezeno.</div>
              </template>
            </div>
            <!-- Pagination -->
            <div v-if="dbTotalPages > 1" class="px-5 py-2 flex items-center justify-between border-t border-gray-100">
              <button :disabled="dbOffset === 0" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbPrevPage()">← Předchozí</button>
              <span class="text-xs text-gray-400">{{ Math.floor(dbOffset / DB_PAGE_SIZE) + 1 }} / {{ dbTotalPages }}</span>
              <button :disabled="dbOffset + DB_PAGE_SIZE >= dbTotal" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbNextPage()">Další →</button>
            </div>
            <!-- Add selected -->
            <div v-if="dbSelectedIds.size > 0" class="px-5 py-2.5 border-t border-gray-100">
              <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="addDbSelected()">
                Přidat vybrané ({{ dbSelectedIds.size }})
              </button>
            </div>
          </div>

          <!-- Manual panel -->
          <div v-if="activeAddPanel === 'manual'" class="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div class="space-y-2">
              <input
                v-model="manualName"
                type="text"
                placeholder="Název záznamu *"
                class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
              />
              <input
                v-model="manualUrl"
                type="text"
                placeholder="URL (volitelné)"
                class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
              />
              <p v-if="stepRecordType" class="text-xs text-gray-400">Typ záznamu: <span class="font-medium text-gray-600">{{ stepRecordType === 'COMPETITION' ? 'Soutěž / Akce' : 'Partner / Organizace' }}</span></p>
            </div>
            <p v-if="manualError" class="text-xs text-red-500 mt-1.5">{{ manualError }}</p>
            <div class="flex gap-2 mt-3">
              <button
                :disabled="manualLoading || !manualName.trim() || !stepId"
                class="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                @click="doManual()"
              >{{ manualLoading ? 'Přidávám...' : 'Přidat' }}</button>
              <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="activeAddPanel = null">Zrušit</button>
            </div>
            <p v-if="!stepId" class="text-xs text-amber-600 mt-1.5">Krok musí být nejprve spuštěn.</p>
          </div>

          <!-- ── Steps 3-6: outputData-driven cards ── -->
          <template v-if="isOutputStep">

            <!-- PARTNER_PROFILING -->
            <div v-if="stepType === 'PARTNER_PROFILING'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
              <div v-if="ppProfiles.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
                <span class="text-3xl opacity-50">📭</span>
                <span>Žádné profily. Spusťte krok nebo importujte data.</span>
              </div>
              <div v-for="(profile, i) in ppProfiles" :key="i" class="p-5">
                <!-- Header -->
                <div class="flex items-start gap-2 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap mb-1">
                      <span class="text-sm font-semibold text-gray-900">{{ getStr(profile, 'name') }}</span>
                      <span v-if="getStr(profile, 'industry')" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ getStr(profile, 'industry') }}</span>
                      <span v-if="getStr(profile, 'size')" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ SIZE_LABELS[getStr(profile, 'size')] ?? getStr(profile, 'size') }}</span>
                      <span v-if="partnerRunCount(getStr(profile, 'name')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(profile, 'name')) }}× pipeline</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                      <a v-if="getStr(profile, 'website')" :href="getStr(profile, 'website')" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
                      <a v-if="getStr(profile, 'linkedinUrl')" :href="getStr(profile, 'linkedinUrl')" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>in LinkedIn</a>
                    </div>
                  </div>
                  <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
                </div>
                <!-- Summary -->
                <p v-if="getStr(profile, 'summary')" class="text-xs text-gray-600 leading-relaxed mb-2" v-html="renderLinks(getStr(profile, 'summary'))" />
                <!-- Contacts -->
                <div v-if="getArr(profile, 'contacts').length > 0" class="mb-2">
                  <div class="text-xs font-medium text-gray-400 mb-1">Kontakty</div>
                  <div class="space-y-1">
                    <div v-for="(contact, ci) in getArr(profile, 'contacts').slice(0, expandedCardIdx === i ? 50 : 3)" :key="ci" class="flex items-center gap-1.5 text-xs">
                      <span :class="['px-1.5 py-0.5 rounded flex-shrink-0 text-xs', CONTACT_TYPE_COLORS[getStr(contact, 'type')] ?? 'bg-gray-100 text-gray-500']">{{ getStr(contact, 'type') }}</span>
                      <span class="font-medium text-gray-700 truncate">{{ [getStr(contact, 'firstName'), getStr(contact, 'lastName')].filter(Boolean).join(' ') || getStr(contact, 'role') }}</span>
                      <span v-if="getStr(contact, 'role') && (getStr(contact, 'firstName') || getStr(contact, 'lastName'))" class="text-gray-400 truncate">{{ getStr(contact, 'role') }}</span>
                      <a v-if="getStr(contact, 'email')" :href="`mailto:${getStr(contact, 'email')}`" class="text-indigo-500 hover:underline ml-auto flex-shrink-0">{{ getStr(contact, 'email') }}</a>
                      <span :class="['flex-shrink-0', CONFIDENCE_COLORS[getStr(contact, 'confidence')] ?? 'text-gray-400']">{{ getStr(contact, 'confidence') }}</span>
                    </div>
                    <button v-if="getArr(profile, 'contacts').length > 3 && expandedCardIdx !== i" class="text-xs text-gray-400 hover:text-gray-600" @click="toggleCard(i)">
                      + {{ getArr(profile, 'contacts').length - 3 }} dalších
                    </button>
                  </div>
                </div>
                <!-- Expanded detail -->
                <template v-if="expandedCardIdx === i">
                  <div v-if="getArr(profile, 'partnershipEvidence').length > 0" class="mb-2">
                    <div class="text-xs font-medium text-gray-400 mb-1">Partnerství</div>
                    <div class="flex flex-wrap gap-1">
                      <span v-for="(ev, ei) in getArr(profile, 'partnershipEvidence')" :key="ei" class="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{{ getStr(ev, 'event') }}<span v-if="getStr(ev, 'year')"> ({{ getStr(ev, 'year') }})</span></span>
                    </div>
                  </div>
                  <div v-if="getArr(profile, 'recentHighlights').length > 0" class="mb-2">
                    <div class="text-xs font-medium text-gray-400 mb-1">Novinky</div>
                    <ul class="space-y-0.5 text-xs text-gray-500 list-disc list-inside">
                      <li v-for="(hl, hi) in getArr(profile, 'recentHighlights')" :key="hi">{{ hl }}</li>
                    </ul>
                  </div>
                  <p v-if="getStr(profile, 'activities')" class="text-xs text-gray-500 mb-2" v-html="renderLinks(getStr(profile, 'activities'))" />
                  <p v-if="getStr(profile, 'researchNotes')" class="text-xs text-gray-400 italic" v-html="'Poznámky: ' + renderLinks(getStr(profile, 'researchNotes'))" />
                </template>
                <div v-if="getArr(profile, 'partnershipStyle').length > 0 && expandedCardIdx !== i" class="flex flex-wrap gap-1">
                  <span v-for="(style, si) in getArr(profile, 'partnershipStyle').slice(0, 3)" :key="si" class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">{{ style }}</span>
                </div>
              </div>
            </div>

            <!-- VALUE_ALIGNMENT -->
            <div v-else-if="stepType === 'VALUE_ALIGNMENT'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
              <div v-if="vaAlignments.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
                <span class="text-3xl opacity-50">📭</span>
                <span>Žádné alignmenty. Spusťte krok nebo importujte data.</span>
              </div>
              <div v-for="(alignment, i) in vaAlignments" :key="i" class="p-5">
                <div class="flex items-start gap-2 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-sm font-semibold text-gray-900">{{ getStr(alignment, 'name') || getStr(alignment, 'partnerName') }}</span>
                      <span v-if="partnerRunCount(getStr(alignment, 'name') || getStr(alignment, 'partnerName')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(alignment, 'name') || getStr(alignment, 'partnerName')) }}× pipeline</span>
                    </div>
                  </div>
                  <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
                </div>
                <!-- Hook hypothesis — 2-line clamp when collapsed -->
                <p
                  v-if="getStr(alignment, 'hookHypothesis')"
                  :class="['text-xs text-indigo-700 bg-indigo-50 rounded px-3 py-2 italic leading-relaxed', expandedCardIdx !== i ? 'line-clamp-2' : '']"
                >{{ getStr(alignment, 'hookHypothesis') }}</p>
                <!-- Expanded only -->
                <template v-if="expandedCardIdx === i">
                  <div v-if="getArr(alignment, 'top3Arguments').length > 0" class="mt-3">
                    <div class="text-xs font-medium text-gray-400 mb-1.5">Top argumenty</div>
                    <div class="space-y-2">
                      <div v-for="(arg, ai) in getArr(alignment, 'top3Arguments')" :key="ai" class="flex gap-2 text-xs">
                        <span class="font-bold text-indigo-500 flex-shrink-0 w-4">{{ getStr(arg, 'rank') }}.</span>
                        <div>
                          <span class="font-medium text-gray-700">{{ getStr(arg, 'argumentLabel') || getStr(arg, 'argumentId') }}</span>
                          <p class="text-gray-500 mt-0.5 leading-relaxed">{{ getStr(arg, 'whyItFits') }}</p>
                          <p v-if="getStr(arg, 'howToFrame')" class="text-gray-400 mt-0.5 leading-relaxed">{{ getStr(arg, 'howToFrame') }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-if="getStr(alignment, 'partnerSnapshot')" class="text-xs text-gray-500 mt-3 leading-relaxed">{{ getStr(alignment, 'partnerSnapshot') }}</p>
                  <div v-if="getArr(alignment, 'argumentsToDrop').length > 0" class="mt-3">
                    <div class="text-xs font-medium text-gray-400 mb-1">Argumenty k vynechání</div>
                    <div class="flex flex-wrap gap-1">
                      <span v-for="(drop, di) in getArr(alignment, 'argumentsToDrop')" :key="di" class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500">{{ getStr(drop, 'argumentLabel') || getStr(drop, 'argumentId') }}</span>
                    </div>
                  </div>
                  <div v-if="getObj(getObj(alignment, 'recommendedContact'), 'primary').role" class="mt-3">
                    <div class="text-xs font-medium text-gray-400 mb-1">Doporučený kontakt</div>
                    <div class="text-xs text-gray-700">
                      <span v-if="getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'name')">{{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'name') }} — </span>
                      {{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'role') }}
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">{{ getStr(getObj(getObj(alignment, 'recommendedContact'), 'primary'), 'reasoning') }}</p>
                  </div>
                </template>
              </div>
            </div>

            <!-- OUTREACH_PREPARATION -->
            <div v-else-if="stepType === 'OUTREACH_PREPARATION'" class="flex-1 overflow-y-auto divide-y divide-gray-100">
              <div v-if="opEmails.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
                <span class="text-3xl opacity-50">📭</span>
                <span>Žádné e-maily. Spusťte krok nebo importujte data.</span>
              </div>
              <div v-for="(email, i) in opEmails" :key="i" class="p-5">
                <div class="flex items-start gap-2 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap mb-1">
                      <span class="text-sm font-semibold text-gray-900">{{ getStr(email, 'partnerName') || getStr(email, 'name') }}</span>
                      <span v-if="partnerRunCount(getStr(email, 'partnerName') || getStr(email, 'name')) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ partnerRunCount(getStr(email, 'partnerName') || getStr(email, 'name')) }}× pipeline</span>
                    </div>
                    <div class="text-xs font-medium text-gray-600 bg-gray-50 px-2.5 py-1.5 rounded">Předmět: {{ getStr(getObj(email, 'email'), 'subject') }}</div>
                  </div>
                  <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-1" @click="toggleCard(i)">{{ expandedCardIdx === i ? '▲' : '▼' }}</button>
                </div>
                <div class="text-xs text-gray-500 bg-gray-50/60 rounded px-3 py-2 mt-2 whitespace-pre-wrap leading-relaxed" :class="expandedCardIdx !== i ? 'line-clamp-4' : ''">{{ getStr(getObj(email, 'email'), 'body') }}</div>
                <template v-if="expandedCardIdx === i">
                  <div v-if="getStr(getObj(email, 'analysis'), 'recipientProfile')" class="mt-3">
                    <div class="text-xs font-medium text-gray-400 mb-1">Profil příjemce</div>
                    <p class="text-xs text-gray-500">{{ getStr(getObj(email, 'analysis'), 'recipientProfile') }}</p>
                  </div>
                </template>
              </div>
            </div>

            <!-- OUTREACH_EXECUTION -->
            <div v-else-if="stepType === 'OUTREACH_EXECUTION'" class="flex-1 overflow-y-auto p-5">
              <div v-if="!oeResult" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
                <span class="text-3xl opacity-50">📭</span>
                <span>Nebyl vytvořen žádný draft. Spusťte krok.</span>
              </div>
              <div v-else class="space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">✓ Draft vytvořen</span>
                  <span class="text-xs text-gray-400">Gmail Draft ID: {{ getStr(oeResult, 'gmailDraftId') }}</span>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                  <div><span class="text-xs text-gray-400 uppercase tracking-wide">Komu</span><p class="font-medium text-gray-800 mt-0.5">{{ getStr(oeResult, 'to') }}</p></div>
                  <div><span class="text-xs text-gray-400 uppercase tracking-wide">Předmět</span><p class="font-medium text-gray-800 mt-0.5">{{ getStr(oeResult, 'subject') }}</p></div>
                </div>
                <p class="text-xs text-gray-400 text-center">Draft je dostupný v Gmail v sekci Koncepty.</p>
              </div>
            </div>

          </template>

          <!-- ── Steps 1-2: GlobalRecord-based rendering ── -->
          <template v-else>

          <template v-if="activeAddPanel === null">
          <!-- Global filter bar -->
          <div class="px-5 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap flex-shrink-0">
            <input
              v-model="searchFilter"
              type="text"
              placeholder="Hledat záznamy..."
              class="flex-1 min-w-32 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300"
            />
            <div v-if="stepType !== 'MARKET_SCANNING' && stepType !== 'PARTNER_IDENTIFICATION'" class="flex gap-1">
              <button
                v-for="(label, key) in STATUS_LABELS"
                :key="key"
                :class="['text-xs px-2 py-1 rounded-full border transition-colors', statusFilter === key ? STATUS_COLORS[key] + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
                @click="statusFilter = statusFilter === key ? '' : key"
              >{{ label }}</button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="recordsLoading" class="flex items-center justify-center h-32 text-gray-400 text-sm">Načítám...</div>

          <!-- Empty state -->
          <div v-else-if="sourcePanels.length === 0" class="flex flex-col items-center justify-center py-14 text-gray-400 text-sm gap-2">
            <span class="text-3xl opacity-50">📭</span>
            <span>Žádná data. Přidejte zdroj pomocí tlačítek výše.</span>
          </div>

          <!-- Source panels -->
          <div v-else>
            <div
              v-for="panel in sourcePanels"
              :key="panel.key"
              :class="['border-b border-gray-100 last:border-b-0', canvas.activeSourceFilter.value === panel.key ? 'ring-1 ring-inset ring-indigo-200 bg-indigo-50/30' : '']"
            >
              <!-- Source header -->
              <button
                class="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                @click="toggleExpand(panel.key)"
              >
                <span :class="['text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', sourceConfig(panel.source?.type).cls]">
                  {{ sourceConfig(panel.source?.type).label }}
                </span>
                <span class="flex-1 text-sm text-gray-700 truncate">{{ panel.source?.label ?? 'Legacy data' }}</span>
                <NuxtLink
                  v-if="panel.source?.pipelineRunId && panel.source.pipelineRunId !== currentRunId"
                  :to="`/pipeline/${panel.source.pipelineRunId}`"
                  class="text-xs text-indigo-500 hover:text-indigo-700 underline flex-shrink-0"
                  @click.stop
                >↗ Zobrazit</NuxtLink>
                <span class="flex items-center gap-2 text-xs flex-shrink-0">
                  <template v-if="stepType !== 'MARKET_SCANNING' && stepType !== 'PARTNER_IDENTIFICATION'">
                    <span v-if="panel.relevant" class="text-green-600 font-medium">{{ panel.relevant }} rel</span>
                    <span v-if="panel.uncertain" class="text-amber-600">{{ panel.uncertain }} nej</span>
                    <span v-if="panel.irrelevant" class="text-gray-400">{{ panel.irrelevant }} irr</span>
                  </template>
                  <span class="text-gray-300" :class="stepType !== 'MARKET_SCANNING' ? 'ml-1' : ''">{{ panel.records.length }} celkem</span>
                </span>
                <svg
                  class="w-4 h-4 text-gray-300 flex-shrink-0 transition-transform duration-150"
                  :class="expandedSources.has(panel.key) ? 'rotate-180' : ''"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <!-- Expanded content -->
              <div v-if="expandedSources.has(panel.key)">
                <!-- Action bar -->
                <div v-if="panel.key !== 'legacy' && stepType !== 'MARKET_SCANNING'" class="px-5 py-1.5 flex items-center gap-3 bg-gray-50/70 border-t border-gray-100">
                  <button class="text-xs text-indigo-600 hover:underline" @click="selectAllInSource(panel.key, true)">Vybrat vše</button>
                  <span class="text-gray-300">|</span>
                  <button class="text-xs text-gray-500 hover:underline" @click="selectAllInSource(panel.key, false)">Zrušit výběr</button>
                  <span v-if="panel.records.some(r => !r.isSelectedForProcessing && !isLegacyRef(r))" class="text-gray-200">|</span>
                  <button
                    v-if="panel.records.some(r => !r.isSelectedForProcessing && !isLegacyRef(r))"
                    class="text-xs text-red-500 hover:underline"
                    @click="deleteUnselected(panel.key)"
                  >Odebrat odznačené</button>
                </div>

                <!-- Record list -->
                <div class="divide-y divide-gray-50 border-t border-gray-100">
                  <template v-for="rec in panelRecords(panel)" :key="rec.id">
                    <!-- Normal row -->
                    <div v-if="editingRefId !== rec.id" class="px-5 py-2.5 hover:bg-gray-50 transition-colors">
                      <div class="flex items-start gap-3">
                        <input
                          v-if="stepType !== 'MARKET_SCANNING'"
                          type="checkbox"
                          :checked="rec.isSelectedForProcessing"
                          :disabled="isLegacyRef(rec)"
                          class="mt-0.5 rounded disabled:opacity-40 flex-shrink-0"
                          @change="toggleSel(rec.id, ($event.target as HTMLInputElement).checked)"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-medium text-gray-800 truncate">{{ rec.globalRecord.canonicalName }}</span>
                            <span v-if="isLegacyRef(rec)" class="text-xs text-gray-300 flex-shrink-0">legacy</span>
                          </div>

                          <!-- MS competition detail -->
                          <template v-if="stepType === 'MARKET_SCANNING'">
                            <div class="flex flex-wrap gap-1 mb-1">
                              <span v-if="msPayload(rec).type" class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{{ msPayload(rec).type }}</span>
                              <span v-if="msPayload(rec).level" class="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{{ LEVEL_LABELS[msPayload(rec).level] ?? msPayload(rec).level }}</span>
                              <span v-if="msPayload(rec).target_group" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ msPayload(rec).target_group }}</span>
                              <span v-if="msPayload(rec).status" :class="['text-xs px-1.5 py-0.5 rounded', COMP_STATUS_COLORS[msPayload(rec).status] ?? 'bg-gray-50 text-gray-400']">{{ COMP_STATUS_LABELS[msPayload(rec).status] ?? msPayload(rec).status }}</span>
                            </div>
                            <p v-if="msPayload(rec).description" class="text-xs text-gray-500 mb-1 line-clamp-2">{{ msPayload(rec).description }}</p>
                            <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                              <span v-if="msPayload(rec).organizer">{{ msPayload(rec).organizer }}</span>
                              <span v-if="msPayload(rec).frequency">{{ msPayload(rec).frequency === 'unknown' ? 'frekvence neznámá' : msPayload(rec).frequency }}</span>
                              <a v-if="msPayload(rec).url" :href="msPayload(rec).url" target="_blank" rel="noopener" class="text-indigo-500 hover:underline" @click.stop>↗ Web</a>
                            </div>
                            <p v-if="recordProvenance(rec)" class="text-xs text-gray-400 mt-1">{{ recordProvenance(rec) }}</p>
                          </template>

                          <!-- PI partner detail -->
                          <template v-else-if="stepType === 'PARTNER_IDENTIFICATION'">
                            <div class="flex flex-wrap items-center gap-1.5 mb-1">
                              <span v-if="piPayload(rec).industry || piPayload(rec).type" class="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{{ piPayload(rec).industry || piPayload(rec).type }}</span>
                              <a v-if="piPayload(rec).website || piPayload(rec).url" :href="piPayload(rec).website || piPayload(rec).url" target="_blank" rel="noopener" class="text-xs text-indigo-500 hover:underline" @click.stop>↗ Web</a>
                              <span
                                v-if="piPartnerSources(rec.globalRecord.canonicalName).length > 0"
                                class="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 cursor-default"
                                :title="piPartnerSources(rec.globalRecord.canonicalName).join(', ')"
                              >{{ piPartnerSources(rec.globalRecord.canonicalName).length }}× zdroj</span>
                              <span v-if="piPipelineCount(rec) > 1" class="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{{ piPipelineCount(rec) }}× pipeline</span>
                            </div>
                            <p v-if="piPayload(rec).description" class="text-xs text-gray-500 line-clamp-2">{{ piPayload(rec).description }}</p>
                            <p v-if="recordProvenance(rec)" class="text-xs text-gray-400 mt-1">{{ recordProvenance(rec) }}</p>
                          </template>

                          <!-- Relevance chips (not for MS or PI) -->
                          <div v-if="stepType !== 'MARKET_SCANNING' && stepType !== 'PARTNER_IDENTIFICATION'" class="flex gap-1">
                            <button
                              v-for="(label, status) in STATUS_LABELS"
                              :key="status"
                              :class="[
                                'text-xs px-2 py-0.5 rounded-full transition-colors',
                                rec.globalRecord.relevanceStatus === status ? STATUS_COLORS[status] : 'bg-gray-50 text-gray-400 hover:bg-gray-100',
                                isLegacyRef(rec) ? 'opacity-40 cursor-not-allowed' : '',
                              ]"
                              :disabled="isLegacyRef(rec)"
                              @click="setStatus(rec, status)"
                            >{{ label }}</button>
                          </div>
                        </div>
                        <!-- Row actions -->
                        <div v-if="!isLegacyRef(rec)" class="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style="opacity: 1">
                          <button
                            class="p-1 text-gray-300 hover:text-gray-500 transition-colors"
                            title="Upravit"
                            @click="startEdit(rec)"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            class="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            title="Odebrat"
                            @click="deleteRecord(rec)"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Edit row -->
                    <div v-else class="px-5 py-3 bg-gray-50 border-t border-gray-100">
                      <div class="space-y-1.5">
                        <input
                          v-model="editName"
                          type="text"
                          placeholder="Název *"
                          class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white font-medium"
                          @keyup.escape="cancelEdit()"
                        />

                        <!-- MS competition extra fields -->
                        <template v-if="stepType === 'MARKET_SCANNING'">
                          <div class="grid grid-cols-2 gap-1.5">
                            <input v-model="editType" type="text" placeholder="Typ (programming, hackathon…)" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                            <select v-model="editLevel" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white">
                              <option value="">Úroveň</option>
                              <option v-for="o in MS_LEVEL_OPTIONS" :key="o" :value="o">{{ LEVEL_LABELS[o] ?? o }}</option>
                            </select>
                            <input v-model="editTargetGroup" type="text" placeholder="Cílová skupina (SŠ, VŠ…)" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                            <input v-model="editOrganizer" type="text" placeholder="Pořadatel" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                            <select v-model="editFrequency" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white">
                              <option value="">Frekvence</option>
                              <option v-for="o in MS_FREQ_OPTIONS" :key="o" :value="o">{{ o === 'unknown' ? 'frekvence neznámá' : o }}</option>
                            </select>
                            <select v-model="editCompStatus" class="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white">
                              <option value="">Stav</option>
                              <option v-for="o in MS_STATUS_OPTIONS" :key="o" :value="o">{{ COMP_STATUS_LABELS[o] ?? o }}</option>
                            </select>
                          </div>
                          <textarea v-model="editDescription" rows="2" placeholder="Popis (1–2 věty)" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white resize-none" />
                        </template>

                        <!-- PI partner extra fields -->
                        <template v-else-if="stepType === 'PARTNER_IDENTIFICATION'">
                          <textarea v-model="editDescription" rows="2" placeholder="Popis partnera" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white resize-none" />
                          <input v-model="editIndustry" type="text" placeholder="Odvětví / Typ" class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
                        </template>

                        <input
                          v-model="editUrl"
                          type="text"
                          placeholder="URL"
                          class="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                          @keyup.escape="cancelEdit()"
                        />
                        <div class="flex gap-2 pt-0.5">
                          <button
                            :disabled="editSaving || !editName.trim()"
                            class="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            @click="saveEdit(rec)"
                          >{{ editSaving ? '...' : 'Uložit' }}</button>
                          <button class="text-xs px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" @click="cancelEdit()">Zrušit</button>
                        </div>
                      </div>
                    </div>
                  </template>

                  <div v-if="panelRecords(panel).length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">
                    Žádné záznamy pro aktuální filtr
                  </div>
                </div>
              </div>
            </div>
          </div>
          </template><!-- /v-if activeAddPanel === null -->
          </template><!-- /v-else steps 1-2 -->
        </template>

        <!-- ── Konfigurace tab ── -->
        <template v-else-if="activeTab === 'config'">
          <!-- MARKET_SCANNING + PARTNER_PROFILING: sub-sections -->
          <template v-if="stepType === 'MARKET_SCANNING' || stepType === 'PARTNER_PROFILING'">
            <!-- Sub-section nav -->
            <div class="px-5 py-3 border-b border-gray-100 flex gap-2 flex-shrink-0">
              <button
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'run' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="configSubSection = 'run'"
              >▶ Spustit AI</button>
              <button
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'import' ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="configSubSection = 'import'"
              >↑ Importovat</button>
              <button
                v-if="stepType === 'MARKET_SCANNING'"
                :class="['text-xs px-3 py-1.5 rounded-lg border transition-colors', configSubSection === 'db' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50']"
                @click="configSubSection = 'db'"
              >🔍 Z databáze</button>
            </div>

            <!-- Spustit AI -->
            <div v-if="configSubSection === 'run'" class="px-5 py-4">
              <div v-if="matchedStep" class="min-w-0">
                <PipelineStepConfig :step="matchedStep" :idx="stepIdx" />
              </div>
              <div v-else class="text-sm text-gray-400 text-center py-12">Tento krok ještě nebyl spuštěn.</div>
            </div>

            <!-- Importovat -->
            <div v-else-if="configSubSection === 'import'" class="px-5 py-4 bg-purple-50/40">
              <textarea
                v-model="importText"
                rows="6"
                placeholder="Vložte JSON nebo text k parsování..."
                class="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-purple-300 font-mono bg-white"
              />
              <p class="text-[10px] text-gray-400 mt-1.5">
                <template v-if="stepType === 'MARKET_SCANNING'">Očekávaný formát: [{ "name": "...", "url": "...", "type": "...", "level": "..." }] — </template>
                <template v-else-if="stepType === 'PARTNER_PROFILING'">Očekávaný formát: [{ "name": "...", "summary": "...", "contacts": [...] }] — </template>
                Textový vstup je také v pořádku, AI ho automaticky parsuje.
              </p>
              <p v-if="importError" class="text-xs text-red-500 mt-1">{{ importError }}</p>
              <div class="flex gap-2 mt-2">
                <button
                  :disabled="importLoading || !importText.trim()"
                  class="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  @click="doImport()"
                >{{ importLoading ? 'Importuji...' : 'Importovat' }}</button>
                <button class="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" @click="configSubSection = 'run'">Zrušit</button>
              </div>
            </div>

            <!-- Z databáze -->
            <div v-else-if="configSubSection === 'db'" class="bg-indigo-50/20">
              <!-- Search + AI toggle -->
              <div class="px-5 pt-3 pb-2 flex items-center gap-2">
                <input
                  v-model="dbQuery"
                  type="text"
                  :placeholder="dbMode === 'ai' ? 'Popište, co hledáte...' : 'Textové vyhledání...'"
                  class="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                  @input="handleDbInput()"
                  @keyup.enter="doDbSearch()"
                />
                <button
                  :class="['text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors', dbMode === 'ai' ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600']"
                  @click="dbMode = dbMode === 'ai' ? 'text' : 'ai'; dbResults = []"
                >AI</button>
                <button
                  v-if="dbMode === 'ai'"
                  :disabled="dbLoading || !dbQuery.trim()"
                  class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  @click="doDbSearch()"
                >{{ dbLoading ? '...' : 'Hledat' }}</button>
              </div>
              <!-- Status filter chips -->
              <div class="px-5 pb-2 flex items-center gap-1 flex-wrap">
                <button
                  v-for="(label, key) in STATUS_LABELS"
                  :key="key"
                  :class="['text-xs px-2 py-0.5 rounded-full border transition-colors', dbStatusFilter === key ? STATUS_COLORS[key] + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300']"
                  @click="dbStatusFilter = dbStatusFilter === key ? '' : key"
                >{{ label }}</button>
              </div>
              <!-- Info row + select all -->
              <div class="px-5 pb-1 flex items-center justify-between">
                <p v-if="dbTotal > 0" class="text-xs text-gray-400">{{ dbTotal }} v databázi · {{ allRecords.length }} přidáno</p>
                <p v-else class="text-xs text-gray-400" />
                <div v-if="dbResults.length > 0" class="flex gap-2">
                  <button class="text-xs text-indigo-600 hover:underline" @click="dbSelectAll()">Vybrat vše</button>
                  <button v-if="dbSelectedIds.size > 0" class="text-xs text-gray-400 hover:underline" @click="dbDeselectAll()">Zrušit</button>
                </div>
              </div>
              <p v-if="dbMode === 'ai'" class="px-5 pb-2 text-xs text-gray-400">AI prohledá záznamy napříč ostatními pipeline</p>
              <!-- Results list -->
              <div class="max-h-52 overflow-y-auto border-t border-gray-100 divide-y divide-gray-50">
                <div v-if="dbLoading" class="px-5 py-3 text-xs text-gray-400">Hledám...</div>
                <template v-else>
                  <div
                    v-for="rec in dbResults"
                    :key="rec.id"
                    class="px-5 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 transition-colors"
                    @click="toggleDbSelect(rec.id)"
                  >
                    <input type="checkbox" :checked="dbSelectedIds.has(rec.id)" class="rounded flex-shrink-0" @click.stop="toggleDbSelect(rec.id)" />
                    <span class="text-sm text-gray-800 flex-1 truncate">{{ rec.canonicalName }}</span>
                    <span :class="['text-xs px-1.5 py-0.5 rounded flex-shrink-0', STATUS_COLORS[rec.relevanceStatus] ?? 'bg-gray-50 text-gray-400']">{{ STATUS_LABELS[rec.relevanceStatus] ?? rec.relevanceStatus }}</span>
                  </div>
                  <div v-if="!dbLoading && dbResults.length === 0" class="px-5 py-3 text-xs text-gray-400 text-center">Nic nenalezeno.</div>
                </template>
              </div>
              <!-- Pagination -->
              <div v-if="dbTotalPages > 1" class="px-5 py-2 flex items-center justify-between border-t border-gray-100">
                <button :disabled="dbOffset === 0" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbPrevPage()">← Předchozí</button>
                <span class="text-xs text-gray-400">{{ Math.floor(dbOffset / DB_PAGE_SIZE) + 1 }} / {{ dbTotalPages }}</span>
                <button :disabled="dbOffset + DB_PAGE_SIZE >= dbTotal" class="text-xs text-gray-500 disabled:opacity-30 hover:text-indigo-600" @click="dbNextPage()">Další →</button>
              </div>
              <!-- Add selected -->
              <div v-if="dbSelectedIds.size > 0" class="px-5 py-2.5 border-t border-gray-100">
                <button class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" @click="addDbSelected()">
                  Přidat vybrané ({{ dbSelectedIds.size }})
                </button>
              </div>
            </div>
          </template>

          <!-- Other steps: standard config -->
          <template v-else>
            <div class="p-5">
              <!-- PI: show how many MS records are selected for the next run -->
              <div
                v-if="stepType === 'PARTNER_IDENTIFICATION' && msRecords.length > 0"
                class="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-700"
              >
                <span>Zpracuje <strong>{{ msTotalSelected }}</strong> z {{ msRecords.length }} zdrojů z&nbsp;Kroku&nbsp;1.</span>
                <button class="ml-auto underline text-indigo-500 hover:text-indigo-700 whitespace-nowrap" @click="activeTab = 'input'">Upravit výběr →</button>
              </div>
              <div v-if="matchedStep" class="min-w-0">
                <PipelineStepConfig :step="matchedStep" :idx="stepIdx" />
              </div>
              <div v-else class="text-sm text-gray-400 text-center py-12">Tento krok ještě nebyl spuštěn.</div>
            </div>
          </template>
        </template>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay-enter-active, .overlay-leave-active { transition: transform 0.2s ease; }
.overlay-enter-from, .overlay-leave-to { transform: translateX(100%); }
</style>
