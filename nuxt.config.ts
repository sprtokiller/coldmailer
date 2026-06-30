const proxyOrigin = process.env.NUXT_GOOGLE_REDIRECT_URI?.replace(
  /\/api\/auth\/callback\/google$/,
  '',
)

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
      'Inter Tight': [400, 500, 600, 700],
      Dosis: [400, 500, 600, 700],
      Figtree: [400, 500, 600, 700],
    },
    display: 'swap',
  },

  runtimeConfig: {
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUri: 'http://localhost:3000/api/auth/callback/google',
    adminEmails: '',
    openRouterApiKey: '',
    openRouterManagementKey: '',
    serpApiKeys: '',
    session: {
      maxAge: 60 * 60 * 24 * 7, // 7 days
      password: '',
    },
  },

  css: [
    '@vue-flow/core/dist/style.css',
    '@vue-flow/core/dist/theme-default.css',
  ],

  typescript: {
    strict: true,
  },

  devServer: {
    host: '0.0.0.0',
  },

  vite: {
    server: {
      allowedHosts: ['coldmailer.scg.cz', 'localhost'],
      ...(proxyOrigin
        ? {
            origin: proxyOrigin,
            hmr: {
              protocol: proxyOrigin.startsWith('https') ? 'wss' : 'ws',
              host: new URL(proxyOrigin).host,
              ...(proxyOrigin.startsWith('https') ? { clientPort: 443 } : {}),
            },
          }
        : {}),
    },
  },

  compatibilityDate: '2024-11-01',
})
