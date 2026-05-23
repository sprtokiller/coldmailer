import type { Ref } from 'vue'
import type { PipelineRunResponse, RunStepResult, PartnerResultItem } from './types'

export function useOutputUtils(
  run: Ref<PipelineRunResponse | null>,
  getStepResult: (key: string) => RunStepResult | undefined,
) {
  const outputViewMode = ref<Record<string, string>>({})

  function getOutputMode(stepKey: string, defaultMode = 'table') {
    return outputViewMode.value[stepKey] ?? defaultMode
  }

  function setOutputMode(stepKey: string, mode: string) {
    outputViewMode.value[stepKey] = mode
  }

  function resolveTable(stepKey: string): { rows: Record<string, unknown>[]; wrapKey: string | null } | null {
    const raw = getStepResult(stepKey)?.outputData
    if (!raw) return null

    if (Array.isArray(raw)) {
      if (raw.length === 0 || typeof raw[0] !== 'object' || raw[0] === null) return null
      return { rows: raw as Record<string, unknown>[], wrapKey: null }
    }

    if (typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          return { rows: value as Record<string, unknown>[], wrapKey: key }
        }
      }
    }

    return null
  }

  function tableColumns(arr: Record<string, unknown>[]): string[] {
    return Object.keys(arr[0] ?? {})
  }

  function profilingOutputProfiles(stepKey: string): Array<Record<string, unknown>> {
    const data = getStepResult(stepKey)?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function alignmentOutputAlignments(stepKey: string): Array<Record<string, unknown>> {
    const data = getStepResult(stepKey)?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function outreachEmails(): Array<Record<string, unknown>> {
    const data = getStepResult('OUTREACH_PREPARATION')?.outputData
    if (!Array.isArray(data)) return []
    return data as Array<Record<string, unknown>>
  }

  function partnerItems(stepKey: string): PartnerResultItem[] {
    const data = getStepResult(stepKey)?.outputData as { items?: PartnerResultItem[] } | undefined
    return data?.items ?? []
  }

  function candidateList(stepKey: string): Array<{ name: string; itemCount: number; itemNames: string[] }> {
    const items = partnerItems(stepKey)
    const map = new Map<string, { name: string; itemCount: number; itemNames: string[] }>()
    for (const item of items) {
      for (const partner of item.partners ?? []) {
        const key = partner.name.toLowerCase().trim()
        if (map.has(key)) {
          const summary = map.get(key)!
          summary.itemCount++
          summary.itemNames.push(item.itemName)
        } else {
          map.set(key, { name: partner.name, itemCount: 1, itemNames: [item.itemName] })
        }
      }
    }
    return [...map.values()].sort((a, b) => b.itemCount - a.itemCount)
  }

  function stepResultOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    return JSON.stringify(result?.outputData ?? result?.errorMessage, null, 2)
  }

  function prevStepOutput(stepKey: string, steps: readonly { key: string }[]): string {
    const idx = steps.findIndex(step => step.key === stepKey)
    if (idx <= 0) return '{}'
    const prevKey = steps[idx - 1].key
    const prevStep = getStepResult(prevKey)
    return prevStep?.outputData ? JSON.stringify(prevStep.outputData, null, 2) : '{}'
  }

  return {
    outputViewMode,
    getOutputMode,
    setOutputMode,
    resolveTable,
    tableColumns,
    profilingOutputProfiles,
    alignmentOutputAlignments,
    outreachEmails,
    partnerItems,
    candidateList,
    stepResultOutput,
    prevStepOutput,
  }
}
