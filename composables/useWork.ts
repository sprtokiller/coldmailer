/**
 * useWork
 *
 * Klientský stav pro záložku Práce — seznam běžících/nedávných úloh z work
 * registru a naplánovaných e-mailů. Stav je sdílený přes useState, takže
 * badge v navigaci i stránka /work čtou stejná data.
 */
export interface WorkJobDto {
  id: string
  kind: 'GMAIL_SYNC' | 'PARTNER_EMAIL_SYNC' | 'SCHEDULED_EMAIL' | 'OUTREACH_SEND' | 'AI_ALIGNMENT' | 'AI_DRAFT'
  label: string
  userId: string
  userName: string | null
  projectId: string | null
  globalRecordId: string | null
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  cancellable: boolean
  startedAt: number
  finishedAt: number | null
  progress: { done: number; total: number | null; message: string | null }
  error: string | null
}

export interface ScheduledEmailDto {
  id: string
  toAddress: string
  subject: string
  scheduledFor: string
  status: 'PENDING' | 'SENDING' | 'FAILED'
  errorMessage: string | null
  createdAt: string
  globalRecordId: string
  globalRecord: { canonicalName: string }
  project: { id: string; name: string }
  createdBy: { id: string; name: string }
}

interface WorkResponse {
  jobs: WorkJobDto[]
  scheduledEmails: ScheduledEmailDto[]
  isAdmin: boolean
  now: number
}

export function useWork() {
  const jobs = useState<WorkJobDto[]>('work-jobs', () => [])
  const scheduledEmails = useState<ScheduledEmailDto[]>('work-scheduled-emails', () => [])
  const isAdmin = useState<boolean>('work-is-admin', () => false)
  const loading = useState<boolean>('work-loading', () => false)
  const lastFetchedAt = useState<number>('work-last-fetched', () => 0)

  const runningJobs = computed(() => jobs.value.filter(j => j.status === 'RUNNING'))
  const finishedJobs = computed(() => jobs.value.filter(j => j.status !== 'RUNNING'))
  const failedScheduledCount = computed(() => scheduledEmails.value.filter(e => e.status === 'FAILED').length)
  const activeCount = computed(() => runningJobs.value.length)

  async function refresh() {
    if (loading.value) return
    loading.value = true
    try {
      const res = await $fetch<WorkResponse>('/api/work')
      jobs.value = res.jobs
      scheduledEmails.value = res.scheduledEmails
      isAdmin.value = res.isAdmin
      lastFetchedAt.value = Date.now()
    } catch {
      // síťová chyba — necháme poslední známý stav
    } finally {
      loading.value = false
    }
  }

  async function cancelJob(id: string) {
    await $fetch(`/api/work/${id}/cancel`, { method: 'POST' })
    await refresh()
  }

  async function sendScheduledNow(id: string) {
    try {
      await $fetch(`/api/work/scheduled-emails/${id}/send-now`, { method: 'POST' })
    } finally {
      await refresh()
    }
  }

  async function cancelScheduled(id: string) {
    await $fetch(`/api/work/scheduled-emails/${id}/cancel`, { method: 'POST' })
    await refresh()
  }

  return {
    jobs,
    scheduledEmails,
    isAdmin,
    loading,
    lastFetchedAt,
    runningJobs,
    finishedJobs,
    failedScheduledCount,
    activeCount,
    refresh,
    cancelJob,
    sendScheduledNow,
    cancelScheduled,
  }
}
