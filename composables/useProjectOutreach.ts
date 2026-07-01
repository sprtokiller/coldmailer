/**
 * useProjectOutreach
 *
 * Správa stavu pro sekci Oslovení na úrovni projektu (nezávislé na PipelineRun).
 * Poskytuje seznam profilovaných partnerů, library data a metody pro spuštění
 * VALUE_ALIGNMENT / OUTREACH_PREPARATION pro konkrétního partnera.
 */
import type { InjectionKey } from 'vue'
import { useUserSession } from '#imports'

export interface OutreachAssignment {
  assigneeId: string
  assignee: { id: string; name: string; image: string | null }
}

export interface OutreachPartner {
  id: string
  canonicalName: string
  type: string
  payload: Record<string, unknown>
  contacts: Array<{
    id: string; address: string; label: string | null; firstName: string | null
    lastName: string | null; role: string | null; contactType: string | null; priority: number; isPrimary: boolean
  }>
  alignment: { globalRecordId: string; createdAt: string; updatedAt: string; author: { name: string } } | null
  draft: { globalRecordId: string; savedAt: string; sentAt: string | null; sendError: string | null; toAddress: string; subject: string; savedBy: { name: string } } | null
  assignment: OutreachAssignment | null
}

export interface OutreachConfig {
  systemPromptId: string
  contextPartIds: string[]
  sellingPointId: string
  emailDraftId: string
  manualContext: string
}

export interface ProjectOutreachContext {
  visiblePartnerCount: ComputedRef<number>
  currentUserId: ComputedRef<string | undefined>
  projectId: Ref<string | null>
  partners: Ref<OutreachPartner[]>
  loadingPartners: Ref<boolean>
  selectedPartnerId: Ref<string | null>
  selectedPartner: ComputedRef<OutreachPartner | null>
  partnerDetail: Ref<{ globalRecord: Record<string, unknown>; profileData: Record<string, unknown> | null; alignment: Record<string, unknown> | null; draft: Record<string, unknown> | null; assignment: OutreachAssignment | null } | null>
  loadingDetail: Ref<boolean>
  prompts: Ref<Array<{ id: string; name: string; content: string; stepType: string; isSystem: boolean; author: { name: string } }>>
  contextParts: Ref<Array<{ id: string; name: string; content: string; stepKeys: string[] }>>
  sellingPoints: Ref<Array<{ id: string; name: string; content: string }>>
  emailDrafts: Ref<Array<{ id: string; name: string; subject: string; body: string }>>
  signatures: Ref<Array<{ id: string; name: string; content: string; groupId: string }>>
  vaConfig: Ref<OutreachConfig>
  opConfig: Ref<OutreachConfig>
  executing: Ref<'alignment' | 'draft' | null>
  streamOutput: Ref<string>
  isAssignedToMe: ComputedRef<boolean>
  canManageAll: Ref<boolean>
  isSubstituting: ComputedRef<boolean>
  canRunAI: ComputedRef<boolean>
  selectPartner: (id: string | null) => Promise<void>
  refreshPartners: () => Promise<void>
  refreshDetail: () => Promise<void>
  runAlignment: () => Promise<void>
  cancelAlignment: () => void
  runDraft: (opts: { selectedContact?: Record<string, unknown>; selectedArgumentIds?: string[] }) => Promise<void>
  saveDraft: (fields: { toAddress: string; subject: string; body: string; config?: Record<string, unknown> }) => Promise<void>
  sendDraft: (fields: { toAddress: string; subject: string; body: string; signatureContent?: string }) => Promise<{ scheduledId: string; gracePeriodMs: number }>
  claimPartner: () => Promise<void>
  assignPartner: (userId: string | null) => Promise<void>
  promptsForStep: (step: string) => Array<{ id: string; name: string; content: string; stepType: string; isSystem: boolean; author: { name: string } }>
}

export const projectOutreachKey = Symbol('projectOutreach') as InjectionKey<ProjectOutreachContext>

export function useProjectOutreach(projectIdRef: Ref<string | null>) {
  const partners = ref<OutreachPartner[]>([])
  const loadingPartners = ref(false)
  const selectedPartnerId = ref<string | null>(null)
  const partnerDetail = ref<ProjectOutreachContext['partnerDetail']['value']>(null)
  const loadingDetail = ref(false)
  const executing = ref<'alignment' | 'draft' | null>(null)
  const streamOutput = ref('')
  const alignmentAbort = ref<AbortController | null>(null)

  const prompts = ref<ProjectOutreachContext['prompts']['value']>([])
  const contextParts = ref<ProjectOutreachContext['contextParts']['value']>([])
  const sellingPoints = ref<ProjectOutreachContext['sellingPoints']['value']>([])
  const emailDrafts = ref<ProjectOutreachContext['emailDrafts']['value']>([])
  const signatures = ref<ProjectOutreachContext['signatures']['value']>([])

  const vaConfig = ref<OutreachConfig>({ systemPromptId: '', contextPartIds: [], sellingPointId: '', emailDraftId: '', manualContext: '' })
  const opConfig = ref<OutreachConfig>({ systemPromptId: '', contextPartIds: [], sellingPointId: '', emailDraftId: '', manualContext: '' })

  const { user: sessionUser } = useUserSession()
  const isAdmin = computed(() => !!(sessionUser.value as any)?.isAdmin)
  const currentUserId = computed(() => (sessionUser.value as any)?.id as string | undefined)

  const canManageAll = ref(false)

  const selectedPartner = computed(() => partners.value.find(p => p.id === selectedPartnerId.value) ?? null)

  const isAssignedToMe = computed(() => {
    const a = selectedPartner.value?.assignment
    return !!a && a.assigneeId === currentUserId.value
  })

  const isSubstituting = computed(() => {
    if (!canManageAll.value) return false
    const assignment = partnerDetail.value?.assignment
    if (!assignment) return false
    return assignment.assigneeId !== currentUserId.value
  })

  const canRunAI = computed(() => canManageAll.value || isAssignedToMe.value)

  const visiblePartnerCount = computed(() => {
    if (canManageAll.value) return partners.value.length
    return partners.value.filter(p => !p.assignment || p.assignment.assigneeId === currentUserId.value).length
  })

  function promptsForStep(step: string) {
    return prompts.value.filter(p => p.stepType === step)
  }

  async function refreshPartners() {
    const pid = projectIdRef.value
    if (!pid) return
    loadingPartners.value = true
    try {
      const resp = await $fetch<{ partners: OutreachPartner[]; canManageAll: boolean }>(`/api/projects/${pid}/outreach/partners`)
      partners.value = resp.partners
      canManageAll.value = resp.canManageAll
    } finally {
      loadingPartners.value = false
    }
  }

  async function refreshDetail() {
    const pid = projectIdRef.value
    const gid = selectedPartnerId.value
    if (!pid || !gid) { partnerDetail.value = null; return }
    loadingDetail.value = true
    try {
      partnerDetail.value = await $fetch(`/api/projects/${pid}/outreach/${gid}`) as ProjectOutreachContext['partnerDetail']['value']
    } finally {
      loadingDetail.value = false
    }
  }

  async function selectPartner(id: string | null) {
    selectedPartnerId.value = id
    partnerDetail.value = null
    streamOutput.value = ''
    if (id) await refreshDetail()
  }

  async function loadLibrary(pid: string) {
    const [p, cp, sp, ed, sig] = await Promise.all([
      $fetch<typeof prompts.value>('/api/library/prompts', { query: { projectId: pid } }),
      $fetch<typeof contextParts.value>('/api/library/context-parts', { query: { projectId: pid } }),
      $fetch<typeof sellingPoints.value>('/api/library/selling-points', { query: { projectId: pid } }),
      $fetch<typeof emailDrafts.value>('/api/library/email-drafts', { query: { projectId: pid } }),
      $fetch<{ templates: unknown[]; personal: typeof signatures.value }>('/api/library/signatures', { query: { projectId: pid } }),
    ])
    prompts.value = p; contextParts.value = cp; sellingPoints.value = sp; emailDrafts.value = ed; signatures.value = sig.personal

    // Auto-select system prompts
    const vaPrompt = p.find(x => x.stepType === 'VALUE_ALIGNMENT' && x.isSystem)
    if (vaPrompt && !vaConfig.value.systemPromptId) vaConfig.value.systemPromptId = vaPrompt.id
    const opPrompt = p.find(x => x.stepType === 'OUTREACH_PREPARATION' && x.isSystem)
    if (opPrompt && !opConfig.value.systemPromptId) opConfig.value.systemPromptId = opPrompt.id
  }

  watch(projectIdRef, async (pid) => {
    if (!pid) return
    await Promise.all([refreshPartners(), loadLibrary(pid)])
  }, { immediate: true })

  function cancelAlignment() {
    alignmentAbort.value?.abort()
  }

  async function runAlignment() {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) return
    const ctrl = new AbortController()
    alignmentAbort.value = ctrl
    executing.value = 'alignment'; streamOutput.value = ''
    try {
      const resp = await fetch(`/api/projects/${pid}/outreach/${gid}/alignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({ systemPromptId: vaConfig.value.systemPromptId || undefined, contextPartIds: vaConfig.value.contextPartIds, sellingPointId: vaConfig.value.sellingPointId || undefined, manualContext: vaConfig.value.manualContext || undefined, profileData: partnerDetail.value?.profileData ?? undefined }),
      })
      const reader = resp.body?.getReader(); if (!reader) throw new Error('No stream')
      const dec = new TextDecoder()
      while (true) {
        if (ctrl.signal.aborted) { reader.cancel(); break }
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5))
            if (ev.chunk) streamOutput.value += ev.chunk
            if (ev.error) throw new Error(ev.error)
          } catch { /* skip parse errors */ }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
    } finally {
      alignmentAbort.value = null
      executing.value = null
      await refreshDetail(); await refreshPartners()
    }
  }

  async function runDraft(opts: { selectedContact?: Record<string, unknown>; selectedArgumentIds?: string[] }) {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) return
    executing.value = 'draft'; streamOutput.value = ''
    try {
      const resp = await fetch(`/api/projects/${pid}/outreach/${gid}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPromptId: opConfig.value.systemPromptId || undefined, emailDraftId: opConfig.value.emailDraftId || undefined, contextPartIds: opConfig.value.contextPartIds, sellingPointId: opConfig.value.sellingPointId || undefined, manualContext: opConfig.value.manualContext || undefined, selectedContact: opts.selectedContact, selectedArgumentIds: opts.selectedArgumentIds }),
      })
      const reader = resp.body?.getReader(); if (!reader) throw new Error('No stream')
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5))
            if (ev.chunk) streamOutput.value += ev.chunk
            if (ev.error) throw new Error(ev.error)
          } catch { /* skip parse errors */ }
        }
      }
    } finally {
      executing.value = null
      await refreshDetail(); await refreshPartners()
    }
  }

  async function saveDraft(fields: { toAddress: string; subject: string; body: string; config?: Record<string, unknown> }) {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) return
    await $fetch(`/api/projects/${pid}/outreach/${gid}/save`, { method: 'POST', body: fields })
    await refreshDetail(); await refreshPartners()
  }

  async function claimPartner() {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) return
    await $fetch(`/api/projects/${pid}/outreach/${gid}/claim`, { method: 'POST' })
    await refreshPartners(); await refreshDetail()
  }

  async function assignPartner(userId: string | null) {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) return
    await $fetch(`/api/projects/${pid}/outreach/${gid}/assign`, { method: 'POST', body: { userId } })
    await refreshPartners(); await refreshDetail()
  }

  async function sendDraft(fields: { toAddress: string; subject: string; body: string; signatureContent?: string }) {
    const pid = projectIdRef.value; const gid = selectedPartnerId.value
    if (!pid || !gid) throw new Error('Není vybrán partner nebo projekt.')
    const result = await $fetch<{ scheduledId: string; gracePeriodMs: number }>(`/api/projects/${pid}/outreach/${gid}/send`, { method: 'POST', body: fields })
    return result
  }

  return {
    projectId: projectIdRef,
    currentUserId,
    partners,
    loadingPartners,
    selectedPartnerId,
    selectedPartner,
    partnerDetail,
    loadingDetail,
    prompts,
    contextParts,
    sellingPoints,
    emailDrafts,
    signatures,
    vaConfig,
    opConfig,
    executing,
    streamOutput,
    isAssignedToMe,
    canManageAll,
    isSubstituting,
    canRunAI,
    visiblePartnerCount,
    selectPartner,
    refreshPartners,
    refreshDetail,
    runAlignment,
    cancelAlignment,
    runDraft,
    saveDraft,
    sendDraft,
    claimPartner,
    assignPartner,
    promptsForStep,
  } as ProjectOutreachContext
}
