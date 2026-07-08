export interface EmailThreadItem {
  id: string
  threadId: string | null
}

export interface LaneColor { line: string; dot: string; text: string }
export interface LaneMark { lane: number; color: LaneColor; isOwn: boolean }
export interface EmailThreadRow<T extends EmailThreadItem> {
  email: T
  lane: number // -1 when this email is the only message in its thread (no rail needed)
  hasLineAbove: boolean
  hasLineBelow: boolean
  laneMarks: LaneMark[]
  laneCount: number
}

const THREAD_LANE_COLORS: LaneColor[] = [
  { line: 'bg-indigo-400', dot: 'bg-indigo-500', text: 'text-indigo-400' },
  { line: 'bg-emerald-400', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  { line: 'bg-amber-400', dot: 'bg-amber-500', text: 'text-amber-400' },
  { line: 'bg-rose-400', dot: 'bg-rose-500', text: 'text-rose-400' },
  { line: 'bg-sky-400', dot: 'bg-sky-500', text: 'text-sky-400' },
  { line: 'bg-violet-400', dot: 'bg-violet-500', text: 'text-violet-400' },
]

function colorForThread(key: string): LaneColor {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return THREAD_LANE_COLORS[hash % THREAD_LANE_COLORS.length]
}

// Emails render flat, newest-first, at the same level (no collapsing). Messages that share
// a Gmail threadId (falling back to the email's own id for anything synced before this field
// existed) get a colored "rail" connecting them so a conversation is still visually traceable
// even when another thread's messages land in between.
export function useEmailThreadRows<T extends EmailThreadItem>(emails: ComputedRef<T[]>) {
  return computed<EmailThreadRow<T>[]>(() => {
    // `emails` must already be in newest-first order.
    const items = emails.value
    const keyOf = (e: T) => e.threadId ?? e.id

    const firstIndex = new Map<string, number>()
    const lastIndex = new Map<string, number>()
    const counts = new Map<string, number>()
    items.forEach((e, i) => {
      const k = keyOf(e)
      if (!firstIndex.has(k)) firstIndex.set(k, i)
      lastIndex.set(k, i)
      counts.set(k, (counts.get(k) ?? 0) + 1)
    })

    const laneOfThread = new Map<string, number>()
    const activeLanes: (string | null)[] = [] // lane index -> owning thread key, or null when free

    const rows: EmailThreadRow<T>[] = items.map((e, i) => {
      const key = keyOf(e)
      const isThread = (counts.get(key) ?? 0) > 1

      let lane = -1
      if (isThread) {
        lane = laneOfThread.get(key) ?? -1
        if (lane === -1) {
          const free = activeLanes.indexOf(null)
          lane = free === -1 ? activeLanes.length : free
          activeLanes[lane] = key
          laneOfThread.set(key, lane)
        }
      }

      const laneMarks: LaneMark[] = activeLanes
        .map((k, idx) => (k ? { lane: idx, color: colorForThread(k), isOwn: idx === lane } : null))
        .filter((m): m is LaneMark => m !== null)

      const row: EmailThreadRow<T> = {
        email: e,
        lane,
        hasLineAbove: isThread && firstIndex.get(key)! < i,
        hasLineBelow: isThread && lastIndex.get(key)! > i,
        laneMarks,
        laneCount: 0,
      }

      if (isThread && lastIndex.get(key) === i) activeLanes[lane] = null
      return row
    })

    const laneCount = Math.max(1, ...rows.map(r => (r.laneMarks.length ? Math.max(...r.laneMarks.map(m => m.lane)) + 1 : 1)))
    return rows.map(r => ({ ...r, laneCount }))
  })
}
