import tailwindcss from '@tailwindcss/vite'
import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webBuildId = process.env.MAGNAT_WEB_BUILD_ID || Date.now().toString(36)
const native = process.env.MAGNAT_NATIVE === '1'
const nativeBuildRoot = process.env.MAGNAT_NATIVE_BUILD_ROOT
const webBuildRoot = !native && process.env.MAGNAT_WEB_BUILD_ROOT
const swaggerAssetsURL = '/docs/assets'

async function copySwaggerAssets(dir: string) {
  const source = fileURLToPath(new URL('./node_modules/swagger-ui-dist/', import.meta.url))
  await mkdir(dir, { recursive: true })
  await Promise.all(['swagger-ui.css', 'swagger-ui-bundle.js'].map(file =>
    copyFile(resolve(source, file), resolve(dir, file)),
  ))
}

export default defineNuxtConfig({
  ...(webBuildRoot ? { buildDir: `${webBuildRoot}/.nuxt` } : {}),
  ...(native ? { ssr: false, buildDir: nativeBuildRoot ? `${nativeBuildRoot}/.nuxt-native` : '.nuxt-native' } : {}),
  nitro: {
    ...(webBuildRoot ? { output: { dir: `${webBuildRoot}/.output` } } : {}),
    ...(native ? {
      output: { dir: nativeBuildRoot ? `${nativeBuildRoot}/.output-native` : '.output-native' },
      prerender: { crawlLinks: false, routes: ['/'] },
    } : {
      openAPI: {
        route: '/docs/openapi.json',
        production: 'runtime',
        meta: { title: 'Magnat API', version: '1.0.0' },
        ui: { scalar: false, swagger: false },
      },
    }),
    experimental: { websocket: true, openAPI: !native },
  },
  hooks: {
    async 'nitro:config'(nitroConfig) {
      if (native || !nitroConfig.dev) return

      const dir = resolve(nitroConfig.buildDir ?? '.nuxt', 'swagger-ui')
      await copySwaggerAssets(dir)
      nitroConfig.publicAssets ??= []
      nitroConfig.publicAssets.push({ dir, baseURL: swaggerAssetsURL, maxAge: 0 })
    },
    async 'nitro:build:public-assets'(nitro) {
      if (!native) await copySwaggerAssets(resolve(nitro.options.output.publicDir, `.${swaggerAssetsURL}`))
    },
  },
  compatibilityDate: '2026-10-15',
  srcDir: 'app/', serverDir: 'server/',
  imports: { dirs: ['composables/**'] },
  devtools: { enabled: false },
  app: { head: { title: 'Magnat', htmlAttrs: { lang: 'ru' }, link: [{ key: 'brand-favicon', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }], meta: [{ name: 'description', content: 'Личное зашифрованное хранилище паролей' }, { name: 'robots', content: 'noindex, nofollow' }] } },
  css: ['~/assets/css/main.css', '~/assets/css/kaban.css', '~/assets/css/native.css'],
  modules: ['./modules/breakpoints', '@nuxt/ui', ...(!native ? ['nuxt-security', '@nuxt/content'] : []), '@pinia/nuxt', '@nuxtjs/i18n'],
  experimental: { appManifest: false },
  ui: { fonts: false, colorMode: false },
  icon: {
    customCollections: [{ prefix: 'magnat', dir: './app/assets/icons' }],
    serverBundle: { collections: ['lucide'] },
    ...(native ? { clientBundle: { scan: true, includeCustomCollections: true } } : {})
  },
  routeRules: {
    // Authenticated APIs use validated-account budgets in requireSharedUser.
    ...Object.fromEntries(['assistant','finance-reports','finance-subscriptions','kaban','notifications','personal-vault','profile','projects','relationship-cards','shared-cards','shared-vaults','team','workspace'].flatMap(root=>[[`/api/${root}`,{security:{rateLimiter:false}}],[`/api/${root}/**`,{security:{rateLimiter:false}}]])),
    '/api/app-version': { headers: { 'Cache-Control': 'no-store' }, security: { rateLimiter: false } },
    '/downloads': { headers: { 'Cache-Control': 'no-store' } },
    '/projects': { ssr: false },
    '/password': { ssr: false }, '/password/**': { ssr: false },
    '/': { ssr: false }, '/categories': { ssr: false }, '/subscriptions': { ssr: false }, '/finances': { ssr: false }, '/admin': { ssr: false }, '/admin/**': { ssr: false },
    '/_nuxt/**': { security: { rateLimiter: false } },
    '/fonts/**': { security: { rateLimiter: false } },
    '/editors/**': { headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'none'",
      'X-Frame-Options': 'SAMEORIGIN', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Embedder-Policy': 'credentialless', 'Cross-Origin-Resource-Policy': 'same-origin'
    } },
    '/api/office/file': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/documents': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/spaces/import': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 104988672, maxUploadFileRequestInBytes: 104988672 } } },
    '/api/projects/*/spaces/*/files': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/documents/import': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 104988672, maxUploadFileRequestInBytes: 104988672 } } },
    '/api/projects/*/documents/*/content': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/input-data/upload': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/projects/*/contracts/*/files': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/contract-register/standalone/*/files': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/assistant/upload': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/profile/avatar': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 2113536, maxUploadFileRequestInBytes: 2113536 } } },
    '/api/projects/*/estimate': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 12582912, maxUploadFileRequestInBytes: 12582912 } } },
    '/settings/**': { ssr:false },
    '/team': { ssr:false }, '/team/**': { ssr:false }, '/profile': { ssr:false },
    '/kaban': { ssr:false },
    '/api/kaban/tasks/*/files': { security: { requestSizeLimiter: { maxRequestSizeInBytes: 21135360, maxUploadFileRequestInBytes: 21135360 } } },
    '/api/auth/brand': { security: { rateLimiter: { tokensPerInterval: 60, interval: 60000 } } },
    '/auth/qr': { ssr: false, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
    '/api/auth/qr/**': { security: { rateLimiter: false } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' }, security: { corsHandler: false } },
    '/supabase/**': { headers: { 'Cache-Control': 'no-store' }, security: { corsHandler: false } }
  },
  runtimeConfig: { ollamaUrl: 'http://localhost:11434', releasesDirectory: '', releasesBuildToken: '', sharedVaultKey: '', supabaseUrl: 'http://localhost:8003', supabaseServiceRoleKey: '', public: { webBuildId, backendOrigin: native ? process.env.MAGNAT_SERVER_URL || 'http://localhost:3003' : '', supabaseUrl: '/supabase', supabaseAnonKey: '' } },
  security: {
    headers: { contentSecurityPolicy: { 'upgrade-insecure-requests': false, 'connect-src': ["'self'", 'ipc:', 'http://ipc.localhost'], 'img-src': ["'self'", 'data:', 'blob:'], 'frame-ancestors': ["'none'"] }, strictTransportSecurity: false, crossOriginOpenerPolicy: false, originAgentCluster: false },
    rateLimiter: { tokensPerInterval: 300, interval: 300000, driver: { name: 'lruCache' } }
  },
  content: { experimental: { sqliteConnector: 'native' } },
  vite: { plugins: [tailwindcss()], ...(native ? { clearScreen: false, server: { strictPort: true }, envPrefix: ['VITE_', 'TAURI_'] } : {}) },
  ignore: ['**/src-tauri/**'],
  i18n: { defaultLocale: 'ru', detectBrowserLanguage: false, strategy: 'no_prefix', locales: [{ code: 'ru', name: 'RU', language: 'ru-RU' }, { code: 'en', name: 'EN', language: 'en-US' }], vueI18n: './i18n.config.ts' }
})
