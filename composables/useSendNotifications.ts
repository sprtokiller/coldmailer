export interface SendNotification {
  id: string
  partnerName: string
  scheduledId: string
  cancelUrl: string
  countdownMs: number
  gracePeriodMs: number
  status: 'pending' | 'sent' | 'error'
  errorMessage?: string
}

const notifications = ref<SendNotification[]>([])
let tickTimer: ReturnType<typeof setInterval> | null = null

function ensureTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    for (const n of notifications.value) {
      if (n.status === 'pending') {
        n.countdownMs = Math.max(0, n.countdownMs - 100)
      }
    }
    if (notifications.value.every(n => n.status !== 'pending')) {
      clearInterval(tickTimer!)
      tickTimer = null
    }
  }, 100)
}

export function useSendNotifications() {
  function add(n: Omit<SendNotification, 'countdownMs' | 'status'>) {
    notifications.value.push({
      ...n,
      countdownMs: n.gracePeriodMs,
      status: 'pending',
    })
    ensureTick()
  }

  function markSent(id: string) {
    const n = notifications.value.find(n => n.id === id)
    if (n) {
      n.status = 'sent'
      n.countdownMs = 0
      setTimeout(() => remove(id), 4000)
    }
  }

  function markError(id: string, message: string) {
    const n = notifications.value.find(n => n.id === id)
    if (n) {
      n.status = 'error'
      n.countdownMs = 0
      n.errorMessage = message
    }
  }

  function remove(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  async function cancel(id: string) {
    const n = notifications.value.find(n => n.id === id)
    if (!n) return
    try {
      await $fetch(n.cancelUrl, {
        method: 'POST',
        body: { scheduledId: n.scheduledId },
      })
    } catch { /* best effort */ }
    remove(id)
  }

  return {
    notifications: readonly(notifications),
    add,
    markSent,
    markError,
    remove,
    cancel,
  }
}
