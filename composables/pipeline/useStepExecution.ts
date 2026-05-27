import type { Ref } from 'vue'
import type { StepConfigState, Step3Candidate, PartnerProgressItem, ProfilingProgressItem, AlignmentProgressItem } from './types'

export function useStepExecution(
  route: ReturnType<typeof useRoute>,
  refresh: () => Promise<void>,
  getConfig: (stepKey: string) => StepConfigState,
  step2Items: () => Array<{ index: number; name: string; raw: Record<string, unknown> }>,
  step2SelectedItems: Ref<Record<string, boolean>>,
  step3FilteredCandidates: () => Step3Candidate[],
  step3SelectedIds: Ref<Record<string, boolean>>,
  step4SelectedIds: Ref<Record<string, boolean>>,
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>,
  step5Alignments: () => Array<Record<string, unknown>>,
  step5SelectedIds: Ref<Record<string, boolean>>,
  outreachEmails: () => Array<Record<string, unknown>>,
  step6PreviewTo: Ref<string>,
  step6PreviewSubject: Ref<string>,
  step6PreviewBody: Ref<string>,
  step6SelectedPartnerName: Ref<string | null>,
  executingStep: Ref<string | null>,
  streamOutputs: Ref<Record<string, string>>,
  partnerProgress: Ref<Record<string, PartnerProgressItem[]>>,
  profilingProgress: Ref<Record<string, ProfilingProgressItem[]>>,
  alignmentProgress: Ref<Record<string, AlignmentProgressItem[]>>,
  updatePartnerItem: (stepKey: string, item: PartnerProgressItem) => void,
  updateProfilingItem: (stepKey: string, item: ProfilingProgressItem) => void,
  updateAlignmentItem: (stepKey: string, item: AlignmentProgressItem) => void,
  step2Initialized: Ref<boolean>,
  step4Initialized: Ref<boolean>,
  step5Initialized: Ref<boolean>,
) {
  async function executeStep(stepKey: string) {
    const cfg = getConfig(stepKey)
    let inputData: Record<string, unknown> = {}

    if (stepKey === 'PARTNER_IDENTIFICATION') {
      // Server reads selection from DB (PipelineRecordRef.isSelectedForProcessing); inputData is ignored.
    } else if (stepKey === 'PARTNER_PROFILING') {
      const allSelected = step3FilteredCandidates().filter(c => step3SelectedIds.value[c.partnerId])
      if (allSelected.length === 0) {
        alert('Vyberte alespoň jednoho partnera k prozkoumání.')
        return
      }
      inputData = { partners: allSelected }
    } else if (stepKey === 'VALUE_ALIGNMENT') {
      const stepCfg = getConfig(stepKey)
      if (!stepCfg.sellingPointId) return
      const allProfiles = profilingOutputProfiles('PARTNER_PROFILING')
      const selected = allProfiles.filter(p => step4SelectedIds.value[String(p.name ?? '')])
      if (selected.length === 0) {
        alert('Vyberte alespoň jednoho partnera k analýze.')
        return
      }
      inputData = { partners: selected }
    } else if (stepKey === 'OUTREACH_PREPARATION') {
      const stepCfg = getConfig(stepKey)
      if (!stepCfg.emailDraftId) {
        alert('Vyberte e-mailovou šablonu z knihovny.')
        return
      }
      const selectedAlignments = step5Alignments()
        .filter(a => step5SelectedIds.value[String(a.name ?? '')])
      if (selectedAlignments.length === 0) {
        alert('Vyberte alespoň jednoho partnera pro přípravu oslovení.')
        return
      }
      inputData = { partners: selectedAlignments }
    } else if (stepKey === 'OUTREACH_EXECUTION') {
      if (!step6PreviewTo.value || !step6PreviewSubject.value || !step6PreviewBody.value) {
        alert('Vyplňte příjemce, předmět a tělo e-mailu v náhledu.')
        return
      }
      inputData = {
        to: step6PreviewTo.value,
        subject: step6PreviewSubject.value,
        body: step6PreviewBody.value,
        partnerName: step6SelectedPartnerName.value,
      }
    } else {
      try {
        inputData = JSON.parse(cfg.inputData || '{}')
      } catch {
        inputData = {}
      }
    }

    executingStep.value = stepKey
    streamOutputs.value[stepKey] = ''
    partnerProgress.value[stepKey] = []
    profilingProgress.value[stepKey] = []
    alignmentProgress.value[stepKey] = []
    let response: Response
    try {
      response = await fetch(`/api/pipeline/${route.params.id}/steps/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepType: stepKey,
          systemPromptId: cfg.systemPromptId || undefined,
          contextPartIds: cfg.contextPartIds.length ? cfg.contextPartIds : undefined,
          manualContext: cfg.manualContext || undefined,
          sellingPointId: cfg.sellingPointId || undefined,
          emailDraftId: cfg.emailDraftId || undefined,
          inputData,
        }),
      })
    } catch {
      executingStep.value = null
      alert('Chyba sítě — nelze se připojit k serveru.')
      return
    }

    if (!response.ok) {
      executingStep.value = null
      const text = await response.text().catch(() => response.statusText)
      alert(`Nepodařilo se spustit krok: ${text}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk !== undefined) {
              streamOutputs.value[stepKey] = (streamOutputs.value[stepKey] ?? '') + data.chunk
            }
            if (data.partnerItem) {
              updatePartnerItem(stepKey, data.partnerItem)
            }
            if (data.profilingItem) {
              updateProfilingItem(stepKey, data.profilingItem)
            }
            if (data.alignmentItem) {
              updateAlignmentItem(stepKey, data.alignmentItem)
            }
            if (data.error) {
              alert(`Step failed: ${data.error}`)
            }
            if (data.done) {
              if (stepKey === 'MARKET_SCANNING') step2Initialized.value = false
              if (stepKey === 'PARTNER_PROFILING') step4Initialized.value = false
              if (stepKey === 'OUTREACH_PREPARATION') step5Initialized.value = false
              await refresh()
            }
          } catch {
            continue
          }
        }
      }
    } finally {
      executingStep.value = null
    }
  }

  return { executeStep }
}
