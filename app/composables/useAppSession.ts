import {todayDate} from '~~/shared/utils/subscriptions'
import { savedAccountsKey } from '~/utils/saved-accounts'
import { accountAccessKey } from '~/utils/account-access'
import { isNativeShell } from '~/utils/native-shell'
import { describeDevice } from '~~/shared/utils/account-device'
export function useAppSession() {
  const queries = useAccountQueries()
  const subscriptionToday=useState('subscription-today',()=>todayDate())
  const auth = useAuthStore(), vault = useVaultStore()
  const shared = useSharedVaultsStore(), notifications = useNotificationsStore()
  const team = useTeamStore()
  watch(() => team.me, profile => {
    if (profile && profile.person.id === auth.user?.id) void auth.updateSavedProfile(profile.person.id, profile.person.fullName, profile.person.avatarUrl)
  })
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
      auth.handleSession(session)
    })
    let deviceBusy = false
    async function heartbeat() {
      const id = auth.user?.id
      if (!id || deviceBusy || !navigator.onLine) return
      deviceBusy = true
      try {
        const platform = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? 'iPad' : navigator.platform
        const result = await sharedRequest<{ accessSettings: { rememberPassword: boolean; logoutMinutes: number } }>('/api/profile/devices', {
          method: 'POST', body: { kind: isNativeShell() ? 'app' : 'web', ...describeDevice(navigator.userAgent, platform) }
        })
        if (auth.user?.id !== id) return
        await auth.syncAccessPolicy(result.accessSettings)
        const person = team.me?.person
        if (person?.id === id) void auth.updateSavedProfile(id, person.fullName, person.avatarUrl)
      } catch (failure: any) {
        if (failure?.statusCode === 401 && auth.user?.id === id) await auth.invalidateSession()
      } finally { deviceBusy = false }
    }
    const stopDeviceWatch = watch(() => auth.user?.id, () => { void heartbeat() }, { immediate: true })
    const deviceTimer = window.setInterval(() => { void heartbeat() }, 30_000)
    const touch = () => { if (auth.idleExpired()) void auth.logout(); else auth.touchActivity() }
    const timer = window.setInterval(() => { subscriptionToday.value=todayDate(); if (auth.idleExpired()) void auth.logout() }, 1000)
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
      if (document.visibilityState === 'hidden') { auth.touchActivity(true); return }
      auth.loadAccessSettings()
      if (auth.idleExpired()) { void auth.logout(); return }
      void heartbeat()
      refreshVisible()
    }
    document.addEventListener('visibilitychange', hide)
    const syncAccounts = (event: StorageEvent) => {
      if (event.key === savedAccountsKey || event.key === null) auth.loadSavedAccounts()
      if (event.key === accountAccessKey || event.key === null) auth.loadAccessSettings()
    }
    window.addEventListener('storage', syncAccounts)
    window.addEventListener('pagehide', vault.lock)
    cleanup = () => { clearInterval(timer); clearInterval(sharedTimer); clearInterval(deviceTimer); stopDeviceWatch(); shared.lock(); notifications.lock(); data.subscription.unsubscribe(); window.removeEventListener('storage', syncAccounts); window.removeEventListener('focus', refreshVisible); window.removeEventListener('online', refreshVisible); events.forEach(event => window.removeEventListener(event, touch)); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', vault.lock); vault.lock() }
  })
  onBeforeUnmount(() => cleanup?.())
}
