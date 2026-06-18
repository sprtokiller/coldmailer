import type { StepRecord } from '~/composables/usePipelineCanvas'
import type { OverlayCoreState } from './useOverlayCore'
import { getStr } from './useOverlayCore'
import { normalizeKey } from '~/composables/pipeline/useSelectionState'

// Combined cast type for pipeline composable methods used by steps 3-6
interface PipelineStepsCtx {
  step3FilteredCandidates?: () => Array<{ partnerId: string; name: string; frequency: number; itemNames: string[]; source?: string }>
  step3SelectedIds: Record<string, boolean>
  piExtraRefs?: Array<{ globalRecordId: string; name: string; addMethod: string; isSelectedForProcessing: boolean; hasProfileData?: boolean }>
  initStep3Selection?: () => void
  step3SelectAll?: () => void; step3DeselectAll?: () => void; step3SelectUnprocessed?: () => void
  step3SelectedCount?: () => number
  step4Partners?: () => Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }>
  step4SelectedIds: Record<string, boolean>
  initStep4Selection?: () => void
  step4SelectAll?: () => void; step4DeselectAll?: () => void; step4SelectUnprocessed?: () => void
  step4SelectedCount?: () => number
  step5Alignments?: () => Array<Record<string, unknown>>
  step5SelectedIds: Record<string, boolean>
  initStep5Selection?: () => void
  step5SelectAll?: () => void; step5DeselectAll?: () => void; step5SelectUnprocessed?: () => void
  step5SelectedCount?: () => number
  outreachEmails?: () => Array<Record<string, unknown>>
  profilingOutputProfiles?: (k: string) => Array<Record<string, unknown>>
  alignmentOutputAlignments?: (k: string) => Array<Record<string, unknown>>
  getStepResult?: (k: string) => { outputData?: unknown } | undefined
}

export function useOverlayStepsInput(core: OverlayCoreState) {
  const { pipeline, stepType, allRecords, currentRunId, canvas } = core
  const pl = pipeline as unknown as PipelineStepsCtx | undefined

  // Steps 3-6 input candidates
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

  // Output data for result cards
  const ppProfiles = computed((): Array<Record<string, unknown>> =>
    stepType.value === 'PARTNER_PROFILING' ? (pl?.profilingOutputProfiles?.('PARTNER_PROFILING') ?? []) : []
  )
  const vaAlignments = computed((): Array<Record<string, unknown>> =>
    stepType.value === 'VALUE_ALIGNMENT' ? (pl?.alignmentOutputAlignments?.('VALUE_ALIGNMENT') ?? []) : []
  )
  const opEmails = computed((): Array<Record<string, unknown>> =>
    stepType.value === 'OUTREACH_PREPARATION' ? (pl?.outreachEmails?.() ?? []) : []
  )
  const oeResult = computed((): Record<string, unknown> | null => {
    if (stepType.value !== 'OUTREACH_EXECUTION') return null
    const d = pl?.getStepResult?.('OUTREACH_EXECUTION')?.outputData
    return (d && typeof d === 'object' && !Array.isArray(d)) ? d as Record<string, unknown> : null
  })

  // PI output items (for "Zpracováno" badge and partner→source mapping)
  const piOutputItems = computed(() => {
    const data = pl?.getStepResult?.('PARTNER_IDENTIFICATION')?.outputData as { items?: unknown[] } | null
    return (data?.items ?? []) as Array<{ itemName: string; partners: Array<{ name: string }> }>
  })
  const piProcessedItemNames = computed(() => {
    const s = new Set<string>()
    for (const item of piOutputItems.value) if (item.itemName) s.add(normalizeKey(item.itemName))
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

  // PI cross-pipeline partner occurrence map
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
  // Sync imported / DB-selected PI refs into pipeline state so step3Candidates sees them
  watch(piRecords, (recs) => {
    if (!pl) return
    const extras = recs
      .filter(r => r.addMethod === 'IMPORTED' || r.addMethod === 'GLOBAL_DB')
      .map(r => ({
        globalRecordId: r.globalRecordId,
        name: r.globalRecord.canonicalName,
        addMethod: r.addMethod,
        isSelectedForProcessing: r.isSelectedForProcessing,
        hasProfileData: Boolean(
          (r.globalRecord.payload as Record<string, unknown>)?.industry
          || (r.globalRecord.payload as Record<string, unknown>)?.contacts,
        ),
      }))
    pl.piExtraRefs = extras
    // Default-select newly appearing candidates (PI panel selection is the default)
    for (const e of extras) {
      if (e.isSelectedForProcessing && !(e.globalRecordId in pl.step3SelectedIds)) {
        pl.step3SelectedIds[e.globalRecordId] = true
      }
    }
  }, { deep: true, immediate: true })

  function partnerRunCount(name: string): number { return piPartnerMap.value.get(name.toLowerCase().trim()) ?? 0 }
  function piPipelineCount(rec: StepRecord): number {
    return new Set(rec.globalRecord.pipelineRefs.map(r => r.pipelineRunId)).size || 1
  }
  function piPayload(rec: StepRecord) { return rec.globalRecord.payload as Record<string, string> }
  function recordProvenance(rec: StepRecord): string {
    const parts: string[] = []
    if (rec.adder?.name) parts.push(`Přidal: ${rec.adder.name}`)
    const n = new Set(rec.globalRecord.pipelineRefs.map(r => r.pipelineRunId)).size
    if (n > 1) parts.push(`${n}× pipeline`)
    return parts.join(' · ')
  }

  // "✓ Hotovo" set for steps 3-5 — built strictly from valid outputData entries
  // (records that errored out or lack a name are not considered processed)
  const processedNames = computed(() => {
    const s = new Set<string>()
    if (stepType.value === 'PARTNER_PROFILING') for (const p of ppProfiles.value) { if (p.error) continue; const n = normalizeKey(getStr(p, 'name')); if (n) s.add(n) }
    else if (stepType.value === 'VALUE_ALIGNMENT') for (const a of vaAlignments.value) { if (a.error) continue; const n = normalizeKey(getStr(a, 'name') || getStr(a, 'partnerName')); if (n) s.add(n) }
    else if (stepType.value === 'OUTREACH_PREPARATION') for (const e of opEmails.value) { if (e.error) continue; const n = normalizeKey(getStr(e, 'partnerName') || getStr(e, 'name')); if (n) s.add(n) }
    return s
  })
  function isProcessed(name: string) { return processedNames.value.has(normalizeKey(name)) }
  function toggleS3(id: string, val: boolean) { if (pl) pl.step3SelectedIds[id] = val }
  function toggleS4(name: string, val: boolean) { if (pl) pl.step4SelectedIds[name] = val }
  function toggleS5(name: string, val: boolean) { if (pl) pl.step5SelectedIds[name] = val }

  // PI result filter/sort
  const piRunFilter = ref<'all' | 'current'>('all')
  const expandedPiPartners = ref(new Set<string>())
  const piCurrentRunCount = computed(() =>
    stepType.value === 'PARTNER_IDENTIFICATION'
      ? allRecords.value.filter(r => r.inputSource?.pipelineRunId === currentRunId).length : 0
  )
  function togglePiPartner(id: string) {
    const s = new Set(expandedPiPartners.value); s.has(id) ? s.delete(id) : s.add(id); expandedPiPartners.value = s
  }

  return {
    pl, s3Candidates, s4Partners, s5Alignments, s6Emails,
    ppProfiles, vaAlignments, opEmails, oeResult,
    piOutputItems, piProcessedItemNames, piPartnerSources,
    piNode, piStepId, piRecords, piPartnerMap,
    partnerRunCount, piPipelineCount, piPayload, recordProvenance,
    processedNames, isProcessed, toggleS3, toggleS4, toggleS5,
    piRunFilter, expandedPiPartners, piCurrentRunCount, togglePiPartner,
  }
}
