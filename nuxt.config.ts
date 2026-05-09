export default defineNuxtConfig({
  modules: [
    'nuxt-auth-utils',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/google-fonts',
  ],

  app: {
    head: {
      title: 'Coldmailer - AI-Powered Email Outreach',
      meta: [
        {
          name: 'description',
          content: 'Coldmailer helps you generate personalized cold emails using AI. Build targeted pipelines, identify partners, and scale your outreach efficiently.',
        },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          property: 'og:title',
          content: 'Coldmailer - AI-Powered Email Outreach',
        },
        {
          property: 'og:description',
          content: 'Coldmailer helps you generate personalized cold emails using AI. Build targeted pipelines, identify partners, and scale your outreach efficiently.',
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          name: 'twitter:title',
          content: 'Coldmailer - AI-Powered Email Outreach',
        },
        {
          name: 'twitter:description',
          content: 'Coldmailer helps you generate personalized cold emails using AI. Build targeted pipelines, identify partners, and scale your outreach efficiently.',
        },
        {
          name: 'theme-color',
          content: '#ffffff',
        },
      ],
      link: [
        {
          rel: 'icon',
          type: 'image/png',
          href: '/favicon.png',
        },
      ],
    },
  },

  googleFonts: {
    families: {
      Parkinsans: [300, 400, 500, 600, 700, 800],
    },
    display: 'swap',
  },

  runtimeConfig: {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback/google',
    openRouterApiKey: process.env.OPEN_ROUTER_API_KEY ?? '',
    openRouterManagementKey: process.env.OPEN_ROUTER_MANAGEMENT_KEY ?? '',
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
