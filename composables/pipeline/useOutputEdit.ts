import type { Ref } from 'vue'
import type { PipelineRunResponse, RunStepResult, PartnerResultItem } from './types'

export function useOutputEdit(
  run: Ref<PipelineRunResponse | null>,
  route: ReturnType<typeof useRoute>,
  refresh: () => Promise<void>,
  getStepResult: (key: string) => RunStepResult | undefined,
  resolveTable: (stepKey: string) => { rows: Record<string, unknown>[]; wrapKey: string | null } | null,
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>,
) {
  const editingOutputStep = ref<string | null>(null)
  const editingOutputDraft = ref('')
  const confirmingOutputStep = ref<string | null>(null)
  const savingOutput = ref(false)

  function startEditOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    editingOutputDraft.value = JSON.stringify(result?.outputData ?? {}, null, 2)
    editingOutputStep.value = stepKey
    confirmingOutputStep.value = null
  }

  function cancelEditOutput() {
    editingOutputStep.value = null
    confirmingOutputStep.value = null
  }

  function requestSaveOutput(stepKey: string) {
    try {
      JSON.parse(editingOutputDraft.value)
    } catch {
      alert('Neplatný JSON – opravte ho před uložením.')
      return
    }
    confirmingOutputStep.value = stepKey
  }

  async function confirmSaveOutput(stepKey: string) {
    const result = getStepResult(stepKey)
    if (!result) return
    savingOutput.value = true
    try {
      await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
        method: 'PATCH',
        body: { outputData: JSON.parse(editingOutputDraft.value) },
      })
      await refresh()
      editingOutputStep.value = null
      confirmingOutputStep.value = null
    } finally {
      savingOutput.value = false
    }
  }

  async function deleteTableRow(stepKey: string, rowIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const table = resolveTable(stepKey)
    if (!table) return
    const newRows = table.rows.filter((_, i) => i !== rowIndex)
    const newData = table.wrapKey ? { ...(result.outputData as Record<string, unknown>), [table.wrapKey]: newRows } : newRows
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: newData },
    })
    await refresh()
  }

  async function deleteTableRows(stepKey: string, rowIndices: number[]) {
    const result = getStepResult(stepKey)
    if (!result) return
    const table = resolveTable(stepKey)
    if (!table) return
    const indexSet = new Set(rowIndices)
    const newRows = table.rows.filter((_, i) => !indexSet.has(i))
    const newData = table.wrapKey ? { ...(result.outputData as Record<string, unknown>), [table.wrapKey]: newRows } : newRows
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: newData },
    })
    await refresh()
  }

  async function deleteProfilingProfile(stepKey: string, profileIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const profiles = profilingOutputProfiles(stepKey)
    const newData = profiles.filter((_, i) => i !== profileIndex)
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: newData },
    })
    await refresh()
  }

  async function deletePartnerItem(stepKey: string, itemIndex: number) {
    const result = getStepResult(stepKey)
    if (!result) return
    const data = result.outputData as { items?: PartnerResultItem[] }
    const newItems = (data.items ?? []).filter((_, i) => i !== itemIndex)
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: { ...data, items: newItems } },
    })
    await refresh()
  }

  async function deletePartnerCandidate(stepKey: string, candidateName: string) {
    const result = getStepResult(stepKey)
    if (!result) return
    const data = result.outputData as { items?: PartnerResultItem[] }
    const key = candidateName.toLowerCase().trim()
    const newItems = (data.items ?? []).map(item => ({
      ...item,
      partners: (item.partners ?? []).filter(p => p.name.toLowerCase().trim() !== key),
    }))
    await $fetch(`/api/pipeline/${route.params.id}/steps/${result.id}`, {
      method: 'PATCH',
      body: { outputData: { ...data, items: newItems } },
    })
    await refresh()
  }

  return {
    editingOutputStep,
    editingOutputDraft,
    confirmingOutputStep,
    savingOutput,
    startEditOutput,
    cancelEditOutput,
    requestSaveOutput,
    confirmSaveOutput,
    deleteTableRow,
    deleteTableRows,
    deleteProfilingProfile,
    deletePartnerItem,
    deletePartnerCandidate,
  }
}
