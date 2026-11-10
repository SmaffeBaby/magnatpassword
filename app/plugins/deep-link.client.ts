import { isTauri } from '@tauri-apps/api/core'
import { qrTokenFromDeepLink } from '~~/shared/utils/qr-login'

export default defineNuxtPlugin(nuxtApp => {
  if (!isTauri()) return
  const router = useRouter()
  let stop: (() => void) | undefined
  let last = ''
  const open = (urls: string[]) => {
    for (const url of urls) {
      const token = qrTokenFromDeepLink(url)
      if (!token || last === token) continue
      last = token
      void router.push({ path: '/auth/qr', hash: `#${new URLSearchParams({ token })}` })
    }
  }
  nuxtApp.hook('app:mounted', async () => {
    try {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
      stop = await onOpenUrl(open)
      const urls = await getCurrent()
      if (urls) open(urls)
    } catch { /* Older installed shells keep browser QR confirmation available. */ }
  })
  nuxtApp.vueApp.onUnmount(() => stop?.())
})
