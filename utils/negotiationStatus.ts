export const NEGOTIATION_STATUS_LABELS: Record<string, string> = {
  PRED_OSLOVENIM: 'Před oslovením',
  V_JEDNANI: 'V jednání',
  CONTACTED: 'Osloveno',
  REMINDED: 'Připomenuto',
  WAITING_FOR_THEM: 'Čekání na ně',
  WAITING_FOR_US: 'Čekání na nás',
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
  FULFILLING: 'bg-purple-100 text-purple-700',
  THANKS_REMAINING: 'bg-teal-100 text-teal-700',
  COMPLETED: 'bg-green-100 text-green-700',
  NOT_INTERESTED: 'bg-gray-100 text-gray-500',
  NOT_THIS_TIME: 'bg-gray-200 text-gray-600',
}

// PRED_OSLOVENIM isn't a manually selectable status — partners in that state
// simply don't show up in /negotiations.
export const EDITABLE_NEGOTIATION_STATUSES = Object.keys(NEGOTIATION_STATUS_LABELS).filter(k => k !== 'PRED_OSLOVENIM')
