import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  srcDir: 'app/', serverDir: 'server/',
  devtools: { enabled: false },
  app: { head: { title: 'Magnat Password', htmlAttrs: { lang: 'ru' }, link: [{ key: 'brand-favicon', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }], meta: [{ name: 'description', content: 'Личное зашифрованное хранилище паролей' }, { name: 'robots', content: 'noindex, nofollow' }] } },
  css: ['~/assets/css/main.css'],
  modules: ['./modules/breakpoints', '@nuxt/ui', 'nuxt-security', '@nuxt/content', '@pinia/nuxt', '@nuxtjs/i18n'],
  experimental: { appManifest: false },
  ui: { fonts: false, colorMode: false },
  icon: { serverBundle: { collections: ['lucide'] } },
  routeRules: {
    '/password': { ssr: false }, '/password/**': { ssr: false },
    '/': { ssr: false }, '/categories': { ssr: false }, '/subscriptions': { ssr: false }, '/finances': { ssr: false }, '/admin': { ssr: false }, '/admin/**': { ssr: false },
    '/_nuxt/**': { security: { rateLimiter: false } },
    '/fonts/**': { security: { rateLimiter: false } },
    '/api/profile/avatar': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 2113536, maxUploadFileRequestInBytes: 2113536 } } },
    '/team': { ssr:false }, '/team/**': { ssr:false }, '/profile': { ssr:false },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
    '/supabase/**': { headers: { 'Cache-Control': 'no-store' } }
  },
  runtimeConfig: { sharedVaultKey: '', supabaseUrl: 'http://localhost:8003', supabaseServiceRoleKey: '', public: { supabaseUrl: '/supabase', supabaseAnonKey: '' } },
  security: {
    headers: { contentSecurityPolicy: { 'upgrade-insecure-requests': false, 'connect-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'frame-ancestors': ["'none'"] }, strictTransportSecurity: false, crossOriginOpenerPolicy: false, originAgentCluster: false },
    rateLimiter: { tokensPerInterval: 300, interval: 300000, driver: { name: 'lruCache' } }
  },
  content: { experimental: { sqliteConnector: 'native' } },
  vite: { plugins: [tailwindcss()] },
  i18n: { defaultLocale: 'ru', detectBrowserLanguage: false, strategy: 'no_prefix', locales: [{ code: 'ru', name: 'RU', language: 'ru-RU' }, { code: 'en', name: 'EN', language: 'en-US' }], vueI18n: './i18n.config.ts' }
})
