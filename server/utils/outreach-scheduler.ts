import { startWork, cancelWork } from '~/server/utils/work-registry'

interface ScheduledSend {
  timerId: ReturnType<typeof setTimeout>
  userId: string
  workId: string
}

const pending = new Map<string, ScheduledSend>()

export function scheduleOutreachSend(
  id: string,
  projectId: string,
  userId: string,
  delayMs: number,
  fn: () => Promise<void>,
  info?: { label?: string; globalRecordId?: string },
): void {
  cancelOutreachSend(id, userId)

  const handle = startWork({
    kind: 'OUTREACH_SEND',
    label: info?.label ?? 'Odeslání e-mailu',
    userId,
    projectId,
    globalRecordId: info?.globalRecordId ?? null,
    refId: id,
    cancellable: true,
    // Zrušení ze záložky Práce musí zastavit i samotný timer.
    onCancel: () => {
      const entry = pending.get(id)
      if (entry) {
        clearTimeout(entry.timerId)
        pending.delete(id)
      }
    },
  })
  handle.setProgress(0, null, `Čeká na odeslání (grace period ${Math.round(delayMs / 1000)}s)`)

  const timerId = setTimeout(async () => {
    pending.delete(id)
    handle.setProgress(0, null, 'Odesílá se…')
    try {
      await fn()
      handle.complete('Odesláno')
    } catch (err) {
      handle.fail(err)
      console.error(`[outreach-scheduler] send ${id} failed:`, err)
    }
  }, delayMs)
  pending.set(id, { timerId, userId, workId: handle.id })
}

export function cancelOutreachSend(id: string, userId: string): boolean {
  const entry = pending.get(id)
  if (!entry) return false
  if (entry.userId !== userId) return false
  clearTimeout(entry.timerId)
  pending.delete(id)
  cancelWork(entry.workId, userId, false)
  return true
}
