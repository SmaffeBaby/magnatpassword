export function useAdminPage() {
  const { productName } = useAccountBrand()
  const auth = useAuthStore(), vault = useVaultStore(), route = useRoute()
  const identity = ref<{ id: string; email?: string } | null>(null), checking = ref(true), accessError = ref('')
  type AdminOverview = { vaults: number; totalUsers: number; users: { id: string; email?: string; createdAt: string; lastSignIn?: string }[] }
  const overview = ref<AdminOverview | null>(null), switchingAccount = ref(false)
  const section = computed(() => ['categories', 'credentials', 'users', 'security'].includes(String(route.query.section)) ? String(route.query.section) : 'overview')
  const titles: Record<string, string> = { overview: 'Обзор хранилища', categories: 'Категории', credentials: 'Пароли', users: 'Пользователи', security: 'Безопасность' }
  const navigation = computed(() => [{ label: 'Хранилище', icon: 'i-lucide-panels-top-left', defaultOpen: true, children: [
    { label: 'Обзор', icon: 'i-lucide-chart-no-axes-combined', to: '/admin', active: section.value === 'overview' },
    { label: 'Категории', icon: 'i-lucide-folders', to: '/admin?section=categories', active: section.value === 'categories' },
    { label: 'Пароли', icon: 'i-lucide-key-round', to: '/admin?section=credentials', active: section.value === 'credentials' }
  ] }, { label: 'Управление', icon: 'i-lucide-settings-2', defaultOpen: true, children: [
    { label: 'Пользователи', icon: 'i-lucide-users', to: '/admin?section=users', active: section.value === 'users' },
    { label: 'Безопасность', icon: 'i-lucide-shield-check', to: '/admin?section=security', active: section.value === 'security' }
  ] }])
  async function adminFetch<T>(url: string): Promise<T> {
    const { $supabase } = useNuxtApp(); const { data } = await $supabase.auth.getSession()
    if (!data.session) throw new Error('Войдите в аккаунт администратора')
    return $fetch<T>(url, { headers: { Authorization: `Bearer ${data.session.access_token}` } }) as Promise<T>
  }
  let restoreAttempt = 0
  async function restore() {
    const attempt = ++restoreAttempt, userId = auth.user?.id
    identity.value = null; overview.value = null; accessError.value = ''
    if (auth.checking) { checking.value = true; return }
    if (!userId) { checking.value = false; return }
    checking.value = true
    try {
      const currentIdentity = await adminFetch<{ id: string; email?: string }>('/api/admin/me')
      const currentOverview = await adminFetch<AdminOverview>('/api/admin/overview')
      if (attempt !== restoreAttempt || auth.user?.id !== userId) return
      identity.value = currentIdentity; overview.value = currentOverview
    } catch (failure: any) {
      if (attempt !== restoreAttempt || auth.user?.id !== userId) return
      const status = failure?.statusCode ?? failure?.status ?? failure?.response?.status
      accessError.value = status === 403 ? 'У текущего аккаунта нет прав администратора. Войдите под аккаунтом администратора.'
        : status === 401 ? 'Сессия завершена. Войдите в аккаунт заново.'
        : 'Не удалось загрузить панель управления. Повторите попытку или проверьте соединение с сервером.'
    } finally { if (attempt === restoreAttempt) checking.value = false }
  }
  async function switchAccount() {
    if (switchingAccount.value) return
    switchingAccount.value = true
    try { await auth.logout() } finally { switchingAccount.value = false }
  }

  watch(() => [auth.checking, auth.user?.id], restore, { immediate: true })
  useHead({ title: () => `${titles[section.value]} · ${productName.value} / Admin` })
  const date = (value?: string) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Ещё не входил'
  return { auth, vault, identity, checking, accessError, overview, section, titles, navigation, restore, switchAccount, switchingAccount, date, productName }
}
