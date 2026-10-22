export function useAdminPage() {
  const { productName } = useAccountBrand()
  const auth = useAuthStore(), vault = useVaultStore(), route = useRoute()
  const identity = ref<{ id: string; email?: string } | null>(null), checking = ref(true), accessError = ref('')
  const overview = ref<{ vaults: number; totalUsers: number; users: { id: string; email?: string; createdAt: string; lastSignIn?: string }[] } | null>(null)
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
  async function restore() {
    if (auth.checking) return
    checking.value = true; accessError.value = ''; identity.value = null
    if (!auth.user) { checking.value = false; return }
    try { identity.value = await adminFetch('/api/admin/me'); overview.value = await adminFetch('/api/admin/overview') }
    catch { accessError.value = 'Нет доступа к панели или сервис недоступен. Войдите под администратором и повторите.' }
    finally { checking.value = false }
  }
  watch(() => [auth.checking, auth.user?.id], restore, { immediate: true })
  useHead({ title: () => `${titles[section.value]} · ${productName.value} / Admin` })
  const date = (value?: string) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Ещё не входил'
  return { auth, vault, identity, checking, accessError, overview, section, titles, navigation, restore, date, productName }
}
