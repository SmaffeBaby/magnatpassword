import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import { normalizeAccountBrand, type AccountBrand } from '~~/shared/utils/branding'
import { parseSavedAccounts, rememberAccount, savedAccountsKey, type SavedAccount } from '~/utils/saved-accounts'
import { accountAccessKey, accountIdleExpired, defaultAccountAccess, logoutOptions, parseAccountAccess, type AccountAccess } from '~/utils/account-access'
import { cacheProfileAvatar } from '~/utils/avatar-cache'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const checking = ref(true), pending = ref(false), error = ref('')
  const savedAccounts = ref<SavedAccount[]>([])
  const storageError = ref('')
  const access = ref<Record<string, AccountAccess>>({})
  const accessSettings = computed(() => user.value ? access.value[user.value.id] ?? defaultAccountAccess() : defaultAccountAccess())
  let paused = false, sessionUserId = '', lastActivityWrite = 0
  const avatarRequests = new Map<string, string>()
  const client = () => useNuxtApp().$supabase
  function loadAccessSettings() {
    try {
      const next = parseAccountAccess(localStorage.getItem(accountAccessKey))
      const id = user.value?.id, current = id ? access.value[id] : undefined
      if (id && current && next[id]) next[id].lastActivity = Math.max(next[id].lastActivity, current.lastActivity)
      access.value = next
      if (id && next[id]?.signedOut) { paused = true; user.value = null }
    } catch { /* Keep in-memory settings when storage is unavailable. */ }
  }
  function updateAccess(id: string, patch: Partial<AccountAccess>): boolean {
    let stored = access.value
    try { stored = parseAccountAccess(localStorage.getItem(accountAccessKey)) } catch {}
    const record = { ...(stored[id] ?? access.value[id] ?? defaultAccountAccess()), ...patch }
    if (!record.rememberPassword) delete record.session
    const next = { ...stored, [id]: record }
    try {
      localStorage.setItem(accountAccessKey, JSON.stringify(next)); access.value = next; storageError.value = ''; return true
    } catch { storageError.value = 'Не удалось сохранить настройки входа на этом устройстве.'; return false }
  }
  function hasQuickLogin(id: string): boolean { return Boolean(access.value[id]?.rememberPassword && access.value[id]?.session) }
  type AccessPolicy = { rememberPassword: boolean; logoutMinutes: number; configured?: boolean }
  async function fetchAccessPolicy(session: Session): Promise<AccessPolicy> {
    const headers = { Authorization: `Bearer ${session.access_token}` }
    const policy = await backendFetch<AccessPolicy>('/api/profile/access', { headers, retry: 0 })
    if (policy.configured !== false) return policy
    const previous = access.value[session.user.id] ?? defaultAccountAccess()
    return backendFetch<AccessPolicy>('/api/profile/access', { method: 'PUT', headers, retry: 0,
      body: { rememberPassword: previous.rememberPassword, logoutMinutes: previous.logoutMinutes, onlyIfMissing: true } })
  }
  function applyAccessPolicy(session: Session, policy: AccessPolicy) {
    if (policy.rememberPassword) saveAccount(session.user)
    updateAccess(session.user.id, { rememberPassword: policy.rememberPassword, logoutMinutes: policy.logoutMinutes,
      session: policy.rememberPassword ? { access_token: session.access_token, refresh_token: session.refresh_token } : undefined })
  }
  async function syncAccessPolicy(policy: AccessPolicy) {
    const id = user.value?.id
    if (!id) return
    const { data } = await client().auth.getSession()
    if (data.session?.user.id === id && user.value?.id === id) applyAccessPolicy(data.session, policy)
  }
  function touchActivity(force = false) {
    const id = user.value?.id
    if (!id) return
    const now = Date.now()
    const record = access.value[id] ?? (access.value[id] = defaultAccountAccess())
    record.lastActivity = now
    if (force || now - lastActivityWrite >= 5000) { updateAccess(id, { lastActivity: now }); lastActivityWrite = now }
  }
  function idleExpired(now = Date.now()): boolean {
    return Boolean(user.value && accountIdleExpired(accessSettings.value, now))
  }
  function handleSession(session: Session | null) {
    if (session) {
      sessionUserId = session.user.id
      if (access.value[session.user.id]?.rememberPassword) updateAccess(session.user.id, { session: { access_token: session.access_token, refresh_token: session.refresh_token } })
      if (!pending.value && !paused && !access.value[session.user.id]?.signedOut) user.value = session.user
    } else if (!pending.value) {
      if (sessionUserId && access.value[sessionUserId]?.session) updateAccess(sessionUserId, { session: undefined })
      user.value = null
    }
  }
  async function saveAccessSettings(rememberPassword: boolean, logoutMinutes: number): Promise<boolean> {
    const id = user.value?.id
    if (!id || pending.value || !logoutOptions.some(option => option.value === logoutMinutes)) return false
    pending.value = true; error.value = ''; storageError.value = ''
    try {
      const { data, error: failure } = await client().auth.getSession()
      if (failure || !data.session || data.session.user.id !== id || user.value?.id !== id) throw new Error('Войдите в аккаунт заново.')
      const policy = await backendFetch<AccessPolicy>('/api/profile/access', { method: 'PUT', retry: 0,
        headers: { Authorization: `Bearer ${data.session.access_token}` }, body: { rememberPassword, logoutMinutes } })
      if (user.value?.id !== id) return false
      rememberPassword = policy.rememberPassword; logoutMinutes = policy.logoutMinutes
      if (rememberPassword) saveAccount(data.session.user)
      if (storageError.value) return false
      return updateAccess(id, { rememberPassword, logoutMinutes, lastActivity: Date.now(), signedOut: false,
        session: rememberPassword ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : undefined })
    } catch { error.value = 'Не удалось сохранить настройки входа. Проверьте соединение и повторите попытку.'; return false }
    finally { pending.value = false }
  }
  async function resumeAccount(id: string): Promise<boolean> {
    if (pending.value) return false
    loadAccessSettings()
    const record = access.value[id]
    if (!record?.rememberPassword || !record.session) return false
    pending.value = true; error.value = ''; paused = true
    try {
      // Refresh on every explicit login, so revoked or expired sessions cannot silently sign in.
      const { data, error: failure } = await client().auth.refreshSession({ refresh_token: record.session.refresh_token })
      if (failure || !data.session) {
        if (failure && failure.status && failure.status >= 400 && failure.status < 500 && failure.status !== 429) updateAccess(id, { session: undefined })
        throw new Error(failure?.status && failure.status >= 400 && failure.status < 500 && failure.status !== 429
          ? 'Сохранённый вход истёк. Введите пароль заново.' : 'Не удалось войти. Проверьте соединение или введите пароль.')
      }
      if (data.session.user.id !== id) { updateAccess(id, { session: undefined }); throw new Error('Войдите в выбранный аккаунт по паролю.') }
      const policy = await fetchAccessPolicy(data.session)
      applyAccessPolicy(data.session, policy)
      if (!policy.rememberPassword) {
        await client().auth.signOut({ scope: 'local' })
        throw new Error('Сохранённый вход отключён в настройках аккаунта. Введите пароль.')
      }
      updateAccess(id, { signedOut: false, lastActivity: Date.now(), session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } })
      sessionUserId = id; paused = false; user.value = data.session.user
      return true
    } catch (failure) { error.value = failure instanceof Error ? failure.message : 'Не удалось войти. Введите пароль.'; return false }
    finally { pending.value = false }
  }
  function loadSavedAccounts() {
    try { savedAccounts.value = parseSavedAccounts(localStorage.getItem(savedAccountsKey)) }
    catch { savedAccounts.value = [] }
  }
  function persistSavedAccounts() {
    storageError.value = ''
    try { localStorage.setItem(savedAccountsKey, JSON.stringify(savedAccounts.value)) }
    catch { storageError.value = 'Не удалось сохранить список аккаунтов на этом устройстве. Проверьте настройки хранения данных.' }
  }
  function forgetAccount(id: string) {
    if (access.value[id]) updateAccess(id, { rememberPassword: false, session: undefined })
    avatarRequests.delete(id)
    savedAccounts.value = savedAccounts.value.filter(account => account.id !== id)
    persistSavedAccounts()
  }
  function saveAccount(current: User) {
    if (!current.email) return
    const previous = savedAccounts.value.find(account => account.id === current.id)
    savedAccounts.value = rememberAccount(savedAccounts.value, {
      id: current.id, email: current.email.trim().toLowerCase(),
      name: previous?.name || (typeof current.user_metadata?.full_name === 'string' ? current.user_metadata.full_name : ''),
      ...(previous?.avatar ? { avatar: previous.avatar } : {})
    })
    persistSavedAccounts()
  }
  async function updateSavedProfile(id: string, name: string, avatarUrl?: string) {
    const account = savedAccounts.value.find(item => item.id === id)
    if (!account) return
    if (account.name !== name) { account.name = name.slice(0, 160); persistSavedAccounts() }
    if (avatarUrl === undefined || avatarRequests.get(id) === avatarUrl) return
    avatarRequests.set(id, avatarUrl)
    if (!avatarUrl) { delete account.avatar; persistSavedAccounts(); return }
    try {
      const avatar = await cacheProfileAvatar(avatarUrl)
      const current = savedAccounts.value.find(item => item.id === id)
      if (!current || avatarRequests.get(id) !== avatarUrl) return
      current.avatar = avatar; persistSavedAccounts()
    } catch { avatarRequests.delete(id) /* Keep the previous local preview if loading fails. */ }
  }
  async function restore() {
    loadSavedAccounts()
    loadAccessSettings()
    try {
      const { data } = await client().auth.getSession()
      const session = data.session
      if (!session) return
      sessionUserId = session.user.id
      applyAccessPolicy(session, await fetchAccessPolicy(session))
      const record = access.value[session.user.id] ?? defaultAccountAccess()
      paused = record.signedOut || accountIdleExpired(record)
      if (record.rememberPassword) updateAccess(session.user.id, { signedOut: paused, session: { access_token: session.access_token, refresh_token: session.refresh_token } })
      if (paused) {
        if (!record.rememberPassword) await client().auth.signOut({ scope: 'local' })
        user.value = null
      } else { user.value = session.user; touchActivity(true) }
    }
    catch { error.value = 'Не удалось восстановить сессию. Войдите в аккаунт заново.' }
    finally { checking.value = false }
  }
  async function authenticate(email: string, password: string, register = false, brand: AccountBrand = 'magnat', remember = true) {
    if (pending.value) return false
    pending.value = true; error.value = ''
    try {
      const { data, error: failure } = register
        ? await client().auth.signUp({ email: email.trim(), password, options: { data: { account_brand: normalizeAccountBrand(brand) } } })
        : await client().auth.signInWithPassword({ email: email.trim(), password })
      if (failure) throw new Error(register ? 'Не удалось создать аккаунт. Проверьте email и пароль или попробуйте войти.' : 'Не удалось войти. Проверьте email и пароль.')
      if (data.session) {
        applyAccessPolicy(data.session, await fetchAccessPolicy(data.session))
        sessionUserId = data.session.user.id; paused = false
        if (remember) saveAccount(data.session.user)
        else forgetAccount(data.session.user.id)
        updateAccess(data.session.user.id, { signedOut: false, lastActivity: Date.now(),
          ...(access.value[data.session.user.id]?.rememberPassword ? { session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } } : {}) })
      }
      user.value = data.session?.user ?? null
      if (!data.session) error.value = 'Подтвердите email по ссылке в письме, затем войдите.'
      return Boolean(data.session)
    } catch (e) { error.value = e instanceof Error ? e.message : 'Сервис недоступен' }
    finally { pending.value = false }
    return false
  }
  async function logout() {
    if (pending.value) return
    pending.value = true; error.value = ''
    useVaultStore().lock()
    try {
      const id = user.value?.id
      if (id && hasQuickLogin(id)) {
        if (!updateAccess(id, { signedOut: true })) throw new Error('Storage unavailable')
        paused = true; user.value = null
        return
      }
      const { error: failure } = await client().auth.signOut({ scope: 'local' })
      if (failure) throw failure
      user.value = null
    } catch { error.value = 'Не удалось завершить сессию. Повторите выход.' }
    finally { pending.value = false }
  }
  async function invalidateSession() {
    const id = user.value?.id
    if (!id) return
    paused = true; user.value = null; useVaultStore().lock()
    updateAccess(id, { signedOut: true, session: undefined })
    try { await client().auth.signOut({ scope: 'local' }) } catch { /* The server has already revoked this device. */ }
  }
  return { user, checking, pending, error, savedAccounts, storageError, accessSettings, loadAccessSettings, saveAccessSettings,
    hasQuickLogin, resumeAccount, touchActivity, idleExpired, handleSession, syncAccessPolicy, invalidateSession, loadSavedAccounts, forgetAccount, updateSavedProfile, restore, authenticate, logout }
})
