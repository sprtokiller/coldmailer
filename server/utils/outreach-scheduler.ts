interface ScheduledSend {
  timerId: ReturnType<typeof setTimeout>
  runId: string
  userId: string
}

const pending = new Map<string, ScheduledSend>()

export function scheduleOutreachSend(
  id: string,
  runId: string,
  userId: string,
  delayMs: number,
  fn: () => Promise<void>,
): void {
  cancelOutreachSend(id, userId)
  const timerId = setTimeout(async () => {
    pending.delete(id)
    try { await fn() } catch (err) {
      console.error(`[outreach-scheduler] send ${id} failed:`, err)
    }
  }, delayMs)
  pending.set(id, { timerId, runId, userId })
}

export function cancelOutreachSend(id: string, userId: string): boolean {
  const entry = pending.get(id)
  if (!entry) return false
  if (entry.userId !== userId) return false
  clearTimeout(entry.timerId)
  pending.delete(id)
  return true
}

