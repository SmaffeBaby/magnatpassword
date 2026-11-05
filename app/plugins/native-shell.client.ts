import { isNativeShell } from '~/utils/native-shell'

export default defineNuxtPlugin(nuxtApp => {
  if (!isNativeShell()) return
  document.documentElement.setAttribute('data-native-shell', '')
  const current = useRuntimeConfig().public.webBuildId
  document.documentElement.dataset.webBuild = String(current)
  const edited = new Set<HTMLElement>()
  let checking = false, pending = false, lastActivity = Date.now()
  const activity = () => { lastActivity = Date.now() }
  const input = (event: Event) => {
    if (event.target instanceof HTMLElement) edited.add(event.target)
    activity()
  }
  function tryReload() {
    if (!pending || document.visibilityState !== 'visible') return
    for (const element of edited) if (!element.isConnected) edited.delete(element)
    const active = document.activeElement
    if (edited.size || (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
    if (Date.now() - lastActivity < 15000) return
    location.reload()
  }
  async function check() {
    if (checking || !navigator.onLine || document.visibilityState !== 'visible') return
    checking = true
    try {
      const next = await $fetch<{ version: string }>('/api/app-version', { cache: 'no-store', timeout: 8000, retry: 0 })
      pending = Boolean(next.version && next.version !== current)
      tryReload()
    } catch { /* The server may be restarting. Retry without interrupting the user. */ }
    finally { checking = false }
  }
  const offRoute = nuxtApp.$router.afterEach(() => { edited.clear(); lastActivity = Date.now() })
  const poll = window.setInterval(check, 30000)
  const reload = window.setInterval(tryReload, 5000)
  const visible = () => { if (document.visibilityState === 'visible') void check() }
  window.addEventListener('input', input, true)
  window.addEventListener('change', input, true)
  window.addEventListener('pointerdown', activity, { passive: true })
  window.addEventListener('keydown', activity, { passive: true })
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', visible)
  nuxtApp.vueApp.onUnmount(() => {
    clearInterval(poll); clearInterval(reload); offRoute()
    window.removeEventListener('input', input, true); window.removeEventListener('change', input, true)
    window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity)
    window.removeEventListener('focus', check); window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', visible)
  })
})
