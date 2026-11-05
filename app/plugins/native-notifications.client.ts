import { invoke, isTauri } from '@tauri-apps/api/core'
export default defineNuxtPlugin({
  name: 'native-notifications',
  enforce: 'post',
  setup(nuxtApp) {
  if (!isTauri()) return
  const auth = useAuthStore(), vault = useVaultStore(), store = useNotificationsStore()
  let account = '', delivered = new Set<string>(), sequence = 0
  const stop = watch(() => [auth.user?.id, vault.unlocked, store.items, store.settings.pushEnabled] as const, async () => {
    const attempt = ++sequence, id = auth.user?.id
    if (account !== id) { account = id || ''; delivered = new Set() }
    const unread = id && vault.unlocked ? store.items.filter(item => !item.readAt) : []
    try {
      await invoke('set_unread_count', { count: unread.length })
      if (attempt !== sequence || !id || !vault.unlocked || !store.settings.pushEnabled) return
      const fresh = unread.filter(item => !delivered.has(item.id))
      if (!fresh.length) return
      const granted = await invoke<boolean>('notification_permission', { request: false })
      if (attempt !== sequence || !granted) return
      if (await invoke<boolean>('show_unread_notification', { count: unread.length })) fresh.forEach(item => delivered.add(item.id))
    } catch { /* Older shells keep the in-app bell until the native app is updated. */ }
  }, { immediate: true, deep: true })
  const poll = window.setInterval(() => { if (auth.user && vault.unlocked && navigator.onLine) void store.refresh(true) }, 30_000)
  nuxtApp.vueApp.onUnmount(() => { stop(); clearInterval(poll); void invoke('set_unread_count', { count: 0 }).catch(() => {}) })
  }
})
