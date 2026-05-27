import type { Ref } from 'vue'
import type { StepConfigState, PromptOption, Step3Candidate } from './types'

export function usePromptBuilding(
  contextParts: Ref<Array<{ id: string; name: string; content: string; stepKeys: string[] }>>,
  getConfig: (stepKey: string) => StepConfigState,
  selectedPrompt: (stepKey: string) => { id: string; name: string; content: string; author: { name: string } } | null,
  profilingOutputProfiles: (stepKey: string) => Array<Record<string, unknown>>,
  step4SelectedIds: Ref<Record<string, boolean>>,
  STEP_SYSTEM_PROMPTS: Record<string, string>,
) {
  const copiedPromptKey = ref<string | null>(null)

  const PLACEHOLDER_CONTEXT = '<[[CONTEXT]]>'
  const PLACEHOLDER_DATA = '<[[DATA]]>'

  function buildFullPrompt(stepKey: string, userMessage: string): string {
    const cfg = getConfig(stepKey)
    const prompt = selectedPrompt(stepKey)
    const systemContent = prompt?.content ?? STEP_SYSTEM_PROMPTS[stepKey] ?? ''

    const selectedCtxParts = contextParts.value.filter(cp => cfg.contextPartIds.includes(cp.id))
    const contextBlock = selectedCtxParts.length
      ? selectedCtxParts.map(cp => `## ${cp.name}\n${cp.content}`).join('\n\n')
      : ''

    const hasContextPh = systemContent.includes(PLACEHOLDER_CONTEXT)
    const hasDataPh = systemContent.includes(PLACEHOLDER_DATA)

    if (hasContextPh || hasDataPh) {
      let result = systemContent
      if (hasContextPh) result = result.replace(PLACEHOLDER_CONTEXT, contextBlock)
      if (hasDataPh) result = result.replace(PLACEHOLDER_DATA, userMessage)
      if (!hasDataPh) result = result + '\n\n---\n\n' + userMessage
      return result
    }

    const parts: string[] = [systemContent]
    if (contextBlock) parts.push(contextBlock)
    parts.push(userMessage)
    return parts.join('\n\n---\n\n')
  }

  function step1CopyPrompt(stepKey: string): string {
    return buildFullPrompt(stepKey, `Research this topic/industry:\n\n{}`)
  }

  function step3PartnerCopyPrompt(stepKey: string, partner: Step3Candidate): string {
    const context = partner.source === 'direct'
      ? 'Přímo importováno do kroku 3'
      : `Nalezen v ${partner.frequency} kontextu(ch): ${partner.itemNames.join(', ')}`
    const lines = [
      'Proveď průzkum tohoto potenciálního partnera a vrať strukturovaný JSON definovaný v systémovém promptu:',
      '',
      `Jméno: ${partner.name}`,
      context,
    ]
    return buildFullPrompt(stepKey, lines.join('\n'))
  }

  function step4CopyPrompt(stepKey: string): string {
    const selected = profilingOutputProfiles('PARTNER_PROFILING')
      .filter(p => step4SelectedIds.value[String(p.name ?? '')])
    if (selected.length === 0) return buildFullPrompt(stepKey, 'Žádní partneři nevybráni.')
    const userMsg = selected.map(p => [
      `Analyzuj soulad pro partnera: ${p.name}`,
      '```json',
      JSON.stringify(p, null, 2),
      '```',
    ].join('\n')).join('\n\n')
    return buildFullPrompt(stepKey, userMsg)
  }

  function step4PartnerCopyPrompt(stepKey: string, partnerName: string): string {
    const profile = profilingOutputProfiles('PARTNER_PROFILING').find(p => String(p.name) === partnerName)
    const userMsg = [
      'Analyzuj soulad mezi tímto partnerem a našimi prodejními argumenty. Vrať strukturovaný JSON dle systémového promptu.',
      '',
      'Profil partnera:',
      '```json',
      JSON.stringify(profile ?? { name: partnerName }, null, 2),
      '```',
    ].join('\n')
    return buildFullPrompt(stepKey, userMsg)
  }

  async function copyDeepResearchPrompt(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copiedPromptKey.value = key
      setTimeout(() => {
        if (copiedPromptKey.value === key) copiedPromptKey.value = null
      }, 2000)
    } catch {
      return
    }
  }

  return {
    copiedPromptKey,
    buildFullPrompt,
    step1CopyPrompt,
    step3PartnerCopyPrompt,
    step4CopyPrompt,
    step4PartnerCopyPrompt,
    copyDeepResearchPrompt,
  }
}
