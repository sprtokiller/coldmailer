import type { StepConfigState } from './types'

export function useAiImport(
  route: ReturnType<typeof useRoute>,
  refresh: () => Promise<void>,
  getConfig: (stepKey: string) => StepConfigState,
) {
  const aiImportStep = ref<string | null>(null)
  const aiImportText = ref('')
  const aiImportLoading = ref(false)

  function isAiImportStep(stepKey: string) {
    return ['MARKET_SCANNING', 'PARTNER_IDENTIFICATION', 'PARTNER_PROFILING', 'VALUE_ALIGNMENT'].includes(stepKey)
  }

  function toggleAiImport(stepKey: string) {
    if (aiImportStep.value === stepKey) {
      aiImportStep.value = null
    } else {
      aiImportStep.value = stepKey
      aiImportText.value = ''
    }
  }

  async function runAiImport(stepKey: string) {
    if (!aiImportText.value.trim()) return
    aiImportLoading.value = true
    try {
      const response = await fetch(`/api/pipeline/${route.params.id}/steps/import-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepType: stepKey,
          systemPromptId: getConfig(stepKey).systemPromptId || undefined,
          rawInputText: aiImportText.value,
        }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)
        throw new Error(text)
      }
      await refresh()
      aiImportStep.value = null
      aiImportText.value = ''
    } catch (error: unknown) {
      alert(`AI Import: ${error instanceof Error ? error.message : 'Import selhal'}`)
    } finally {
      aiImportLoading.value = false
    }
  }

  return {
    aiImportStep,
    aiImportText,
    aiImportLoading,
    isAiImportStep,
    toggleAiImport,
    runAiImport,
  }
}
