// Global fetch interceptor: when the session cookie has silently expired (e.g. the
// tab was left open for days), API calls start failing with 401 but nothing was
// redirecting the user to /login — they'd just see a blank/broken page. This catches
// any 401 from our own API and sends them to /login once, instead of per-request.
export default defineNuxtPlugin(() => {
  let redirecting = false

  const original = globalThis.$fetch
  globalThis.$fetch = original.create({
    async onResponseError({ request, response }) {
      if (response.status !== 401) return

      const url = typeof request === 'string' ? request : request.url
      if (!url.startsWith('/api/') || url.startsWith('/api/auth/')) return

      if (redirecting || useRoute().path === '/login') return
      redirecting = true

      const { clear } = useUserSession()
      useToast().show('Přihlášení vypršelo, přihlas se prosím znovu.', 'info')
      await clear()
      await navigateTo('/login')
    },
  }) as typeof $fetch
})
