export function useGmailSyncState() {
  const syncError = useState<'auth-error' | 'error' | null>('gmail-sync-error', () => null)
  const isSyncing = useState<boolean>('gmail-sync-active', () => false)
  const lastSyncAt = useState<number>('gmail-last-sync-at', () => 0)
  return { syncError, isSyncing, lastSyncAt }
}

export function useGmailSync() {
  const { syncError, isSyncing, lastSyncAt } = useGmailSyncState()
  const interval = ref<ReturnType<typeof setInterval>>()

  async function sync() {
    if (isSyncing.value) return { synced: 0, skipped: 'in-progress' }
    isSyncing.value = true
    try {
      const res = await $fetch<{ synced: number; skipped?: string; assigned?: boolean }>('/api/gmail/sync', { method: 'POST' })
      if (res.skipped === 'auth-error') {
        syncError.value = 'auth-error'
      } else if (res.skipped === 'error') {
        syncError.value = 'error'
      } else {
        syncError.value = null
      }
      return res
    } catch {
      syncError.value = 'error'
      return { synced: 0 }
    } finally {
      lastSyncAt.value = Date.now()
      isSyncing.value = false
    }
  }

  // Background auto-sync only makes sense for users who are actually assigned to
  // something (plnitelé) — vedení obchodu / admin only sync manually via the button.
  onMounted(async () => {
    const res = await sync()
    if (res.assigned) {
      interval.value = setInterval(sync, 5 * 60_000)
    }
  })

  onUnmounted(() => {
    if (interval.value) clearInterval(interval.value)
  })

  return { syncError, isSyncing, triggerSync: sync }
}
