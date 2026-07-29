export const NEGOTIATION_STATUS_LABELS: Record<string, string> = {
  PRED_OSLOVENIM: 'Před oslovením',
  V_JEDNANI: 'V jednání',
  CONTACTED: 'Osloveno',
  REMINDED: 'Připomenuto',
  WAITING_FOR_THEM: 'Čekání na ně',
  WAITING_FOR_US: 'Čekání na nás',
  PRED_SCHUZKOU: 'Před schůzkou',
  FULFILLING: 'Plnění',
  THANKS_REMAINING: 'Zbývá poděkovat',
  COMPLETED: 'Dokončeno',
  NOT_INTERESTED: 'Nezájem',
  NOT_THIS_TIME: 'Tentokrát nezájem',
}

export const NEGOTIATION_STATUS_COLORS: Record<string, string> = {
  PRED_OSLOVENIM: 'bg-gray-100 text-gray-400',
  V_JEDNANI: 'bg-gray-100 text-gray-500',
  CONTACTED: 'bg-blue-100 text-blue-700',
  REMINDED: 'bg-yellow-100 text-yellow-700',
  WAITING_FOR_THEM: 'bg-orange-100 text-orange-700',
  WAITING_FOR_US: 'bg-red-100 text-red-700',
  PRED_SCHUZKOU: 'bg-cyan-100 text-cyan-700',
  FULFILLING: 'bg-purple-100 text-purple-700',
  THANKS_REMAINING: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-green-100 text-green-700',
  NOT_INTERESTED: 'bg-gray-100 text-gray-500',
  NOT_THIS_TIME: 'bg-gray-200 text-gray-600',
}

// PRED_OSLOVENIM isn't a manually selectable status — partners in that state
// simply don't show up in /negotiations.
export const EDITABLE_NEGOTIATION_STATUSES = Object.keys(NEGOTIATION_STATUS_LABELS).filter(k => k !== 'PRED_OSLOVENIM')

// ── Last-activity ageing colour (shared by /negotiations overview column and the
// negotiation-detail activity box) ─────────────────────────────────────────────
export type LastActivityLevel = 'none' | 'fresh' | 'yellow' | 'orange' | 'red' | 'closed'

const CLOSED_STATUSES = new Set(['NOT_INTERESTED', 'NOT_THIS_TIME'])

export function lastActivityLevel(status: string | null | undefined, lastActivityAt: string | Date | null | undefined): LastActivityLevel {
  if (CLOSED_STATUSES.has(status ?? '')) return 'closed'
  if (!lastActivityAt) return 'none'
  const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000
  if (days < 3) return 'fresh'
  if (days < 7) return 'yellow'
  if (days < 14) return 'orange'
  return 'red'
}

export const LAST_ACTIVITY_COLOR_CLASSES: Record<LastActivityLevel, string> = {
  none: 'bg-gray-100 text-gray-400',
  closed: 'bg-gray-100 text-gray-400',
  fresh: '',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
}

export function lastActivityColor(status: string | null | undefined, lastActivityAt: string | Date | null | undefined): string {
  return LAST_ACTIVITY_COLOR_CLASSES[lastActivityLevel(status, lastActivityAt)]
}

// Orange/red = the partner has gone quiet long enough that a reminder is warranted.
export function isReminderWorthy(status: string | null | undefined, lastActivityAt: string | Date | null | undefined): boolean {
  const level = lastActivityLevel(status, lastActivityAt)
  return level === 'orange' || level === 'red'
}
