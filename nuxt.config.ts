export default defineNuxtConfig({
  modules: [
    'nuxt-auth-utils',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/google-fonts',
  ],

  googleFonts: {
    families: {
      Asap: [400, 500, 600, 700],
    },
    display: 'swap',
  },

  runtimeConfig: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback/google',
    openRouterApiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
    session: {
      maxAge: 60 * 60 * 24 * 7, // 7 days
      password: process.env.NUXT_SESSION_PASSWORD ?? '',
    },
  },

  typescript: {
    strict: true,
  },

  compatibilityDate: '2024-11-01',
})
