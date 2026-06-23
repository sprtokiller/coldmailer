export function useGmailSync() {
  const syncError = useState<'auth-error' | 'error' | null>('gmail-sync-error', () => null)
  const interval = ref<ReturnType<typeof setInterval>>()

  async function sync() {
    try {
      const res = await $fetch<{ synced: number; skipped?: string }>('/api/gmail/sync', { method: 'POST' })
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
    }
  }

  onMounted(() => {
    sync()
    interval.value = setInterval(sync, 60_000)
  })

  onUnmounted(() => {
    if (interval.value) clearInterval(interval.value)
  })

  return { syncError, triggerSync: sync }
}
