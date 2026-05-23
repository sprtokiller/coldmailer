import type { PartnerProgressItem, ProfilingProgressItem, AlignmentProgressItem } from './types'

export function useProgressTracking() {
  const partnerProgress = ref<Record<string, PartnerProgressItem[]>>({})
  const profilingProgress = ref<Record<string, ProfilingProgressItem[]>>({})
  const alignmentProgress = ref<Record<string, AlignmentProgressItem[]>>({})

  function updatePartnerItem(stepKey: string, item: PartnerProgressItem) {
    if (!partnerProgress.value[stepKey]) partnerProgress.value[stepKey] = []
    const idx = partnerProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) partnerProgress.value[stepKey][idx] = item
    else partnerProgress.value[stepKey].push(item)
  }

  function updateProfilingItem(stepKey: string, item: ProfilingProgressItem) {
    if (!profilingProgress.value[stepKey]) profilingProgress.value[stepKey] = []
    const idx = profilingProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) profilingProgress.value[stepKey][idx] = item
    else profilingProgress.value[stepKey].push(item)
  }

  function updateAlignmentItem(stepKey: string, item: AlignmentProgressItem) {
    if (!alignmentProgress.value[stepKey]) alignmentProgress.value[stepKey] = []
    const idx = alignmentProgress.value[stepKey].findIndex(i => i.index === item.index)
    if (idx >= 0) alignmentProgress.value[stepKey][idx] = item
    else alignmentProgress.value[stepKey].push(item)
  }

  return {
    partnerProgress,
    profilingProgress,
    alignmentProgress,
    updatePartnerItem,
    updateProfilingItem,
    updateAlignmentItem,
  }
}
