import type { RunStepResult, Step3Candidate } from './types'

export function useSelectionState(
  getStepResult: (key: string) => RunStepResult | undefined,
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>,
  alignmentOutputAlignments: (stepKey: string) => Array<Record<string, unknown>>,
  outreachEmails: () => Array<Record<string, unknown>>,
  partnerItems: (stepKey: string) => Array<{ itemName: string; partners?: Array<{ partnerId: string; name: string; isNew: boolean }> }>,
) {
  // Step 2 (PARTNER_IDENTIFICATION)
  const step2SelectedItems = ref<Record<string, boolean>>({})
  const step2Initialized = ref(false)

  function step2Items(): Array<{ index: number; name: string; raw: Record<string, unknown> }> {
    const data = getStepResult('MARKET_SCANNING')?.outputData
    if (!data) return []
    let arr: Record<string, unknown>[]
    if (Array.isArray(data)) {
      arr = data as Record<string, unknown>[]
    } else if (data && typeof data === 'object') {
      const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray) as unknown[][]
      arr = arrays.length === 1 ? arrays[0] as Record<string, unknown>[] : []
    } else {
      arr = []
    }
    return arr.map((item, i) => ({
      index: i,
      name: String(item.name ?? item.title ?? item.url ?? `Položka ${i + 1}`),
      raw: item,
    }))
  }

  function initStep2Selection() {
    if (step2Initialized.value) return
    const selected: Record<string, boolean> = {}
    for (const item of step2Items()) selected[String(item.index)] = true
    step2SelectedItems.value = selected
    step2Initialized.value = true
  }

  function step2SelectAll() {
    const selected = { ...step2SelectedItems.value }
    for (const item of step2Items()) selected[String(item.index)] = true
    step2SelectedItems.value = selected
  }

  function step2DeselectAll() {
    const selected = { ...step2SelectedItems.value }
    for (const item of step2Items()) selected[String(item.index)] = false
    step2SelectedItems.value = selected
  }

  function step2SelectedCount() {
    return step2Items().filter(item => step2SelectedItems.value[String(item.index)]).length
  }

  // Step 3 (PARTNER_PROFILING)
  const step3SelectedIds = ref<Record<string, boolean>>({})
  const step3FreqFilter = ref(1)
  const step3Initialized = ref(false)

  function step3Candidates(): Step3Candidate[] {
    const items = partnerItems('PARTNER_IDENTIFICATION')
    const map = new Map<string, Step3Candidate>()
    for (const item of items) {
      for (const p of (item.partners ?? []) as Array<{ partnerId: string; name: string }>) {
        if (!p.partnerId) continue
        if (map.has(p.partnerId)) {
          const candidate = map.get(p.partnerId)!
          candidate.frequency++
          candidate.itemNames.push(item.itemName)
        } else {
          map.set(p.partnerId, { partnerId: p.partnerId, name: p.name, frequency: 1, itemNames: [item.itemName], source: 'step2' })
        }
      }
    }

    // Include partners that exist in step 3's output but were not identified in step 2
    const existingNames = new Set([...map.values()].map(c => c.name.toLowerCase().trim()))
    for (const profile of profilingOutputProfiles('PARTNER_PROFILING')) {
      const name = String(profile.name ?? '')
      if (!name) continue
      if (!existingNames.has(name.toLowerCase().trim())) {
        const syntheticId = 'direct:' + name.toLowerCase().trim()
        map.set(syntheticId, { partnerId: syntheticId, name, frequency: 0, itemNames: [], source: 'direct' })
        existingNames.add(name.toLowerCase().trim())
      }
    }

    return [...map.values()].sort((a, b) => b.frequency - a.frequency)
  }

  function step3FilteredCandidates() {
    return step3Candidates().filter(candidate =>
      candidate.source === 'direct' || candidate.frequency >= step3FreqFilter.value,
    )
  }

  function initStep3Selection() {
    if (step3Initialized.value) return
    const done = new Set(
      profilingOutputProfiles('PARTNER_PROFILING').map(p =>
        String(p.partnerId ?? p.name ?? '').toLowerCase(),
      ),
    )
    const selected: Record<string, boolean> = {}
    for (const candidate of step3Candidates()) {
      const isProcessed = done.has(candidate.partnerId.toLowerCase()) || done.has(candidate.name.toLowerCase())
      selected[candidate.partnerId] = !isProcessed
    }
    step3SelectedIds.value = selected
    step3Initialized.value = true
  }

  function step3SelectAll() {
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3Candidates()) {
      if (candidate.frequency >= step3FreqFilter.value) selected[candidate.partnerId] = true
    }
    step3SelectedIds.value = selected
  }

  function step3DeselectAll() {
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3Candidates()) selected[candidate.partnerId] = false
    step3SelectedIds.value = selected
  }

  function step3SelectUnprocessed() {
    const done = new Set(
      profilingOutputProfiles('PARTNER_PROFILING').map(p =>
        String(p.partnerId ?? p.name ?? '').toLowerCase(),
      ),
    )
    const selected = { ...step3SelectedIds.value }
    for (const candidate of step3FilteredCandidates()) {
      const isProcessed = done.has(candidate.partnerId.toLowerCase()) || done.has(candidate.name.toLowerCase())
      selected[candidate.partnerId] = !isProcessed
    }
    step3SelectedIds.value = selected
  }

  function step3SelectedCount() {
    return step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId]).length
  }

  // Step 4 (VALUE_ALIGNMENT)
  const step4SelectedIds = ref<Record<string, boolean>>({})
  const step4Initialized = ref(false)

  function step4Partners(): Array<{ partnerId?: string; name: string; website?: string; linkedinUrl?: string; industry?: string }> {
    const data = getStepResult('PARTNER_PROFILING')?.outputData
    if (!Array.isArray(data)) return []
    return (data as Record<string, unknown>[])
      .filter(p => p.name && !p.error)
      .map(p => ({
        partnerId: p.partnerId as string | undefined,
        name: String(p.name),
        website: p.website as string | undefined,
        linkedinUrl: p.linkedinUrl as string | undefined,
        industry: p.industry as string | undefined,
      }))
  }

  function initStep4Selection() {
    if (step4Initialized.value) return
    const done = new Set(
      alignmentOutputAlignments('VALUE_ALIGNMENT').map(a =>
        String(a.partnerId ?? a.name ?? '').toLowerCase(),
      ),
    )
    const selected: Record<string, boolean> = {}
    for (const p of step4Partners()) {
      const isProcessed = done.has(String(p.partnerId ?? '').toLowerCase()) || done.has(p.name.toLowerCase())
      selected[p.name] = !isProcessed
    }
    step4SelectedIds.value = selected
    step4Initialized.value = true
  }

  function step4SelectAll() {
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) selected[p.name] = true
    step4SelectedIds.value = selected
  }

  function step4DeselectAll() {
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) selected[p.name] = false
    step4SelectedIds.value = selected
  }

  function step4SelectUnprocessed() {
    const done = new Set(
      alignmentOutputAlignments('VALUE_ALIGNMENT').map(a =>
        String(a.partnerId ?? a.name ?? '').toLowerCase(),
      ),
    )
    const selected = { ...step4SelectedIds.value }
    for (const p of step4Partners()) {
      const isProcessed = done.has(String(p.partnerId ?? '').toLowerCase()) || done.has(p.name.toLowerCase())
      selected[p.name] = !isProcessed
    }
    step4SelectedIds.value = selected
  }

  function step4SelectedCount() {
    return step4Partners().filter(p => step4SelectedIds.value[p.name]).length
  }

  // Step 5 (OUTREACH_PREPARATION)
  const step5SelectedIds = ref<Record<string, boolean>>({})
  const step5Initialized = ref(false)

  function step5Alignments(): Array<Record<string, unknown>> {
    return alignmentOutputAlignments('VALUE_ALIGNMENT')
  }

  function initStep5Selection() {
    if (step5Initialized.value) return
    const done = new Set(
      outreachEmails().map(e => String(e.partnerName ?? e.name ?? '').toLowerCase()),
    )
    const selected: Record<string, boolean> = {}
    for (const a of step5Alignments()) {
      const isProcessed = done.has(String(a.name ?? '').toLowerCase())
      selected[String(a.name ?? '')] = !isProcessed
    }
    step5SelectedIds.value = selected
    step5Initialized.value = true
  }

  function step5SelectAll() {
    const selected = { ...step5SelectedIds.value }
    for (const a of step5Alignments()) selected[String(a.name ?? '')] = true
    step5SelectedIds.value = selected
  }

  function step5DeselectAll() {
    const selected = { ...step5SelectedIds.value }
    for (const a of step5Alignments()) selected[String(a.name ?? '')] = false
    step5SelectedIds.value = selected
  }

  function step5SelectedCount() {
    return step5Alignments().filter(a => step5SelectedIds.value[String(a.name ?? '')]).length
  }

  // Step 6 (OUTREACH_EXECUTION)
  const step6SelectedPartnerName = ref<string | null>(null)
  const step6PreviewTo = ref('')
  const step6PreviewSubject = ref('')
  const step6PreviewBody = ref('')

  function initStep6Preview(partnerName: string) {
    const email = outreachEmails().find(e => String(e.partnerName ?? e.name ?? '') === partnerName)
    if (email) {
      step6PreviewTo.value = String(email.to ?? '')
      step6PreviewSubject.value = String(email.subject ?? '')
      step6PreviewBody.value = String(email.body ?? '')
    }
  }

  return {
    // Step 2
    step2SelectedItems,
    step2Initialized,
    step2Items,
    initStep2Selection,
    step2SelectAll,
    step2DeselectAll,
    step2SelectedCount,
    // Step 3
    step3SelectedIds,
    step3FreqFilter,
    step3Initialized,
    step3Candidates,
    initStep3Selection,
    step3SelectAll,
    step3DeselectAll,
    step3SelectUnprocessed,
    step3FilteredCandidates,
    step3SelectedCount,
    // Step 4
    step4SelectedIds,
    step4Initialized,
    step4Partners,
    initStep4Selection,
    step4SelectAll,
    step4DeselectAll,
    step4SelectUnprocessed,
    step4SelectedCount,
    // Step 5
    step5SelectedIds,
    step5Initialized,
    step5Alignments,
    initStep5Selection,
    step5SelectAll,
    step5DeselectAll,
    step5SelectedCount,
    // Step 6
    step6SelectedPartnerName,
    step6PreviewTo,
    step6PreviewSubject,
    step6PreviewBody,
    initStep6Preview,
  }
}
