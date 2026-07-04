import { randomUUID } from 'node:crypto'

/**
 * In-memory registr běžící a nedávno dokončené práce na serveru (synchronizace
 * Gmailu, plánované e-maily, AI generování, grace-period odeslání…).
 *
 * Jediný zdroj pravdy pro záložku „Práce" — každá dlouhotrvající operace se sem
 * registruje, hlásí průběh a dá se odsud (pokud je cancellable) zrušit.
 *
 * Registr je čistě in-memory (aplikace běží jako single instance); po restartu
 * serveru je prázdný. Trvalý stav (ScheduledEmail) žije v DB a work API ho
 * přikládá zvlášť.
 */

export type WorkKind =
  | 'GMAIL_SYNC'
  | 'PARTNER_EMAIL_SYNC'
  | 'SCHEDULED_EMAIL'
  | 'OUTREACH_SEND'
  | 'AI_ALIGNMENT'
  | 'AI_DRAFT'

export type WorkStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface WorkProgress {
  done: number
  total: number | null
  message: string | null
}

export interface WorkJob {
  id: string
  kind: WorkKind
  label: string
  userId: string
  projectId: string | null
  globalRecordId: string | null
  /** ID navázané entity (např. ScheduledEmail.id nebo scheduledId grace-period odeslání). */
  refId: string | null
  status: WorkStatus
  cancellable: boolean
  startedAt: number
  finishedAt: number | null
  progress: WorkProgress
  error: string | null
}

interface WorkEntry {
  job: WorkJob
  controller: AbortController
  onCancel?: () => void
}

// Uloženo na globalThis, aby registr přežil HMR reload modulů v dev režimu.
const store: Map<string, WorkEntry> = ((globalThis as unknown as { __workRegistry?: Map<string, WorkEntry> }).__workRegistry ??= new Map())

const FINISHED_TTL_MS = 30 * 60 * 1000
const MAX_FINISHED = 200

function prune(): void {
  const now = Date.now()
  const finished: WorkEntry[] = []
  for (const entry of store.values()) {
    if (entry.job.finishedAt !== null) {
      if (now - entry.job.finishedAt > FINISHED_TTL_MS) store.delete(entry.job.id)
      else finished.push(entry)
    }
  }
  if (finished.length > MAX_FINISHED) {
    finished.sort((a, b) => a.job.finishedAt! - b.job.finishedAt!)
    for (const entry of finished.slice(0, finished.length - MAX_FINISHED)) {
      store.delete(entry.job.id)
    }
  }
}

export interface StartWorkOptions {
  kind: WorkKind
  label: string
  userId: string
  projectId?: string | null
  globalRecordId?: string | null
  refId?: string | null
  cancellable?: boolean
  total?: number | null
  /** Zavolá se při zrušení z work API — musí zastavit vlastní běh (clearTimeout apod.). */
  onCancel?: () => void
}

export interface WorkHandle {
  id: string
  signal: AbortSignal
  setProgress: (done: number, total?: number | null, message?: string | null) => void
  complete: (message?: string | null) => void
  /** Označí práci za FAILED; pokud už mezitím byla zrušena, stav CANCELLED zůstává. */
  fail: (err: unknown) => void
  /**
   * Odstraní záznam úplně (pro no-op běhy, které nemá smysl ukazovat v historii).
   * Už dokončené/zrušené záznamy nechává být, aby nezmizely z historie.
   */
  discard: () => void
}

export function startWork(opts: StartWorkOptions): WorkHandle {
  prune()
  const id = randomUUID()
  const controller = new AbortController()
  const job: WorkJob = {
    id,
    kind: opts.kind,
    label: opts.label,
    userId: opts.userId,
    projectId: opts.projectId ?? null,
    globalRecordId: opts.globalRecordId ?? null,
    refId: opts.refId ?? null,
    status: 'RUNNING',
    cancellable: opts.cancellable ?? false,
    startedAt: Date.now(),
    finishedAt: null,
    progress: { done: 0, total: opts.total ?? null, message: null },
    error: null,
  }
  store.set(id, { job, controller, onCancel: opts.onCancel })

  return {
    id,
    signal: controller.signal,
    setProgress(done, total, message) {
      if (job.finishedAt !== null) return
      job.progress.done = done
      if (total !== undefined) job.progress.total = total
      if (message !== undefined) job.progress.message = message
    },
    complete(message) {
      if (job.finishedAt !== null) return
      job.status = 'COMPLETED'
      job.finishedAt = Date.now()
      if (message !== undefined) job.progress.message = message
    },
    fail(err) {
      if (job.finishedAt !== null) return
      job.status = controller.signal.aborted ? 'CANCELLED' : 'FAILED'
      job.finishedAt = Date.now()
      job.error = err instanceof Error ? err.message : String(err)
    },
    discard() {
      if (job.finishedAt === null) store.delete(id)
    },
  }
}

/**
 * Spustí fn jako trackovanou práci — stav COMPLETED/FAILED/CANCELLED se nastaví
 * automaticky podle výsledku. Výjimku propaguje dál volajícímu.
 */
export async function runWork<T>(opts: StartWorkOptions, fn: (handle: WorkHandle) => Promise<T>): Promise<T> {
  const handle = startWork(opts)
  try {
    const result = await fn(handle)
    handle.complete()
    return result
  } catch (err) {
    handle.fail(err)
    throw err
  }
}

export function hasRunningWork(kind: WorkKind, userId: string): boolean {
  for (const entry of store.values()) {
    if (entry.job.status === 'RUNNING' && entry.job.kind === kind && entry.job.userId === userId) return true
  }
  return false
}

export function hasRunningWorkByRef(kind: WorkKind, refId: string): boolean {
  for (const entry of store.values()) {
    if (entry.job.status === 'RUNNING' && entry.job.kind === kind && entry.job.refId === refId) return true
  }
  return false
}

export function listWork(userId: string, isAdmin: boolean): WorkJob[] {
  prune()
  const jobs: WorkJob[] = []
  for (const entry of store.values()) {
    if (isAdmin || entry.job.userId === userId) jobs.push(entry.job)
  }
  // Běžící první (nejnovější nahoře), pak dokončené podle času dokončení.
  return jobs.sort((a, b) => {
    const aRunning = a.finishedAt === null
    const bRunning = b.finishedAt === null
    if (aRunning !== bRunning) return aRunning ? -1 : 1
    if (aRunning) return b.startedAt - a.startedAt
    return b.finishedAt! - a.finishedAt!
  })
}

export function cancelWork(id: string, userId: string, isAdmin: boolean): boolean {
  const entry = store.get(id)
  if (!entry) return false
  if (!isAdmin && entry.job.userId !== userId) return false
  if (!entry.job.cancellable || entry.job.finishedAt !== null) return false

  entry.job.status = 'CANCELLED'
  entry.job.finishedAt = Date.now()
  entry.controller.abort(new Error('Zrušeno uživatelem'))
  try {
    entry.onCancel?.()
  } catch (err) {
    console.error(`[work-registry] onCancel for ${id} failed:`, err)
  }
  return true
}

/**
 * Spustí fn nad položkami s omezenou souběžností. Chyby jednotlivých položek
 * nepřeruší zbytek — vrací je v poli výsledků.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { ok: true, value: await fn(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
    }
  })
  await Promise.all(workers)
  return results
}
