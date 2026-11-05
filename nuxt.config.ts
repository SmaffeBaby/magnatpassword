import tailwindcss from '@tailwindcss/vite'

const webBuildId = process.env.MAGNAT_WEB_BUILD_ID || Date.now().toString(36)
const native = process.env.MAGNAT_NATIVE === '1'
const nativeBuildRoot = process.env.MAGNAT_NATIVE_BUILD_ROOT
const webBuildRoot = !native && process.env.MAGNAT_WEB_BUILD_ROOT

export default defineNuxtConfig({
  ...(webBuildRoot ? { buildDir: `${webBuildRoot}/.nuxt`, nitro: { output: { dir: `${webBuildRoot}/.output` } } } : {}),
  ...(native ? { ssr: false, buildDir: nativeBuildRoot ? `${nativeBuildRoot}/.nuxt-native` : '.nuxt-native', nitro: { output: { dir: nativeBuildRoot ? `${nativeBuildRoot}/.output-native` : '.output-native' }, prerender: { crawlLinks: false, routes: ['/'] } } } : {}),
  compatibilityDate: '2026-10-15',
  srcDir: 'app/', serverDir: 'server/',
  devtools: { enabled: false },
  app: { head: { title: 'Magnat', htmlAttrs: { lang: 'ru' }, link: [{ key: 'brand-favicon', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }], meta: [{ name: 'description', content: 'Личное зашифрованное хранилище паролей' }, { name: 'robots', content: 'noindex, nofollow' }] } },
  css: ['~/assets/css/main.css', '~/assets/css/native.css'],
  modules: ['./modules/breakpoints', '@nuxt/ui', ...(!native ? ['nuxt-security', '@nuxt/content'] : []), '@pinia/nuxt', '@nuxtjs/i18n'],
  experimental: { appManifest: false },
  ui: { fonts: false, colorMode: false },
  icon: { serverBundle: { collections: ['lucide'] }, ...(native ? { clientBundle: { scan: true, includeCustomCollections: true } } : {}) },
  routeRules: {
    '/api/app-version': { headers: { 'Cache-Control': 'no-store' }, security: { rateLimiter: false } },
    '/downloads': { headers: { 'Cache-Control': 'no-store' } },
    '/projects': { ssr: false },
    '/password': { ssr: false }, '/password/**': { ssr: false },
    '/': { ssr: false }, '/categories': { ssr: false }, '/subscriptions': { ssr: false }, '/finances': { ssr: false }, '/admin': { ssr: false }, '/admin/**': { ssr: false },
    '/_nuxt/**': { security: { rateLimiter: false } },
    '/fonts/**': { security: { rateLimiter: false } },
    '/api/projects/*/input-data/upload': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/contracts/*/files': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/profile/avatar': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 2113536, maxUploadFileRequestInBytes: 2113536 } } },
    '/api/projects/*/estimate': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 12582912, maxUploadFileRequestInBytes: 12582912 } } },
    '/team': { ssr:false }, '/team/**': { ssr:false }, '/profile': { ssr:false },
    '/api/auth/brand': { security: { rateLimiter: { tokensPerInterval: 60, interval: 60000 } } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' }, security: { corsHandler: false } },
    '/supabase/**': { headers: { 'Cache-Control': 'no-store' }, security: { corsHandler: false } }
  },
  runtimeConfig: { releasesDirectory: '', releasesBuildToken: '', sharedVaultKey: '', supabaseUrl: 'http://localhost:8003', supabaseServiceRoleKey: '', public: { webBuildId, backendOrigin: native ? process.env.MAGNAT_SERVER_URL || 'http://localhost:3003' : '', supabaseUrl: '/supabase', supabaseAnonKey: '' } },
  security: {
    headers: { contentSecurityPolicy: { 'upgrade-insecure-requests': false, 'connect-src': ["'self'"], 'img-src': ["'self'", 'data:', 'blob:'], 'frame-ancestors': ["'none'"] }, strictTransportSecurity: false, crossOriginOpenerPolicy: false, originAgentCluster: false },
    rateLimiter: { tokensPerInterval: 300, interval: 300000, driver: { name: 'lruCache' } }
  },
  content: { experimental: { sqliteConnector: 'native' } },
  vite: { plugins: [tailwindcss()], ...(native ? { clearScreen: false, server: { strictPort: true }, envPrefix: ['VITE_', 'TAURI_'] } : {}) },
  ignore: ['**/src-tauri/**'],
  i18n: { defaultLocale: 'ru', detectBrowserLanguage: false, strategy: 'no_prefix', locales: [{ code: 'ru', name: 'RU', language: 'ru-RU' }, { code: 'en', name: 'EN', language: 'en-US' }], vueI18n: './i18n.config.ts' }
})
