import {todayDate} from '~~/shared/utils/subscriptions'
export function useAppSession() {
  const queries = useAccountQueries()
  const subscriptionToday=useState('subscription-today',()=>todayDate())
  const auth = useAuthStore(), vault = useVaultStore()
  const shared = useSharedVaultsStore(), notifications = useNotificationsStore()
  watch(() => vault.unlocked, open => { if (open) { shared.refresh(); notifications.refresh(); useTeamStore().refreshMe() } else { shared.lock(); notifications.lock(); useTeamStore().lock(); useFiltersStore().reset(); useFinanceReportsStore().lock() } })
  const { brand, productName, previewBrand } = useAccountBrand()
  useHead(() => ({ htmlAttrs: { 'data-brand': brand.value }, title: productName.value, link: [{ key: 'brand-favicon', rel: 'icon', type: 'image/svg+xml', href: brand.value === 'light' ? '/light-favicon.svg' : '/favicon.svg' }] }))
  watch(() => auth.user?.id, (id, previous) => {
    if (id !== previous) { vault.lock(); queries.clear() }
    if (!id && previous) previewBrand.value = 'magnat'
  }, { flush: 'sync' })
  let cleanup: (() => void) | undefined
  onMounted(async () => {
    const { $supabase } = useNuxtApp()
    await auth.restore()
    const { data } = $supabase.auth.onAuthStateChange((_event, session) => {
      if (auth.user?.id !== session?.user.id) vault.lock()
      auth.user = session?.user ?? null
    })
    let activity = Date.now()
    const touch = () => { activity = Date.now() }
    const timer = window.setInterval(() => { subscriptionToday.value=todayDate(); if (vault.unlocked && Date.now() - activity > 5 * 60_000) auth.logout() }, 5000)
    const refreshVisible = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || !vault.unlocked) return
      subscriptionToday.value = todayDate()
      shared.refresh(); notifications.refresh()
    }
    const sharedTimer = window.setInterval(refreshVisible, 60_000)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('online', refreshVisible)
    const events = ['pointerdown', 'keydown', 'scroll']
    events.forEach(event => window.addEventListener(event, touch, { passive: true }))
    const hide = () => {
      if (document.visibilityState === 'visible' && Date.now() - activity > 5 * 60_000) { auth.logout(); return }
      refreshVisible()
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', vault.lock)
    cleanup = () => { clearInterval(timer); clearInterval(sharedTimer); shared.lock(); notifications.lock(); data.subscription.unsubscribe(); window.removeEventListener('focus', refreshVisible); window.removeEventListener('online', refreshVisible); events.forEach(event => window.removeEventListener(event, touch)); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', vault.lock); vault.lock() }
  })
  onBeforeUnmount(() => cleanup?.())
}
