export function useGmailSync() {
  const interval = ref<ReturnType<typeof setInterval>>()

  async function sync() {
    try {
      await $fetch('/api/gmail/sync', { method: 'POST' })
    } catch {}
  }

  onMounted(() => {
    sync()
    interval.value = setInterval(sync, 60_000)
  })

  onUnmounted(() => {
    if (interval.value) clearInterval(interval.value)
  })
}
