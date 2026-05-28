import type { StepRecord } from '~/composables/usePipelineCanvas'
import type { OverlayCoreState } from './useOverlayCore'

export interface InputSourceGroup {
  key: string
  source: StepRecord['inputSource']
  records: StepRecord[]
  selectedCount: number
}

export function useOverlayMsInput(core: OverlayCoreState) {
  const { canvas, activeTab } = core

  const msNode = computed(() => canvas.nodes.value.find(n => n.data.stepType === 'MARKET_SCANNING'))
  const msStepId = computed(() => msNode.value?.data.stepId ?? null)
  const msRecords = computed<StepRecord[]>(() =>
    msStepId.value ? canvas.stepRecords.value[msStepId.value] ?? [] : []
  )
  const msRecordsLoading = computed(() =>
    msStepId.value ? canvas.stepRecordsLoading.value[msStepId.value] : false
  )

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

  // Load MS records when input tab is activated
  watch(activeTab, (tab) => {
    if (tab === 'input' && msStepId.value && !canvas.stepRecords.value[msStepId.value]) {
      canvas.fetchStepRecords(msStepId.value)
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

  return {
    msNode, msStepId, msRecords, msRecordsLoading,
    msSourceGroups, msExpandedGroups, msTotalSelected,
    toggleMsGroup, toggleMsSel, selectAllInGroup,
  }
}
