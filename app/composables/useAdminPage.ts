export function useAdminPage() {
  const queries = useAccountQueries()
  const { productName } = useAccountBrand()
  const auth = useAuthStore(), vault = useVaultStore(), route = useRoute()
  const identity = ref<{ id: string; email?: string } | null>(null), checking = ref(true), accessError = ref('')
  type AdminOverview = { vaults: number; totalUsers: number; users: { isHidden?:boolean; id: string; email?: string; createdAt: string; lastSignIn?: string }[] }
  const overview = ref<AdminOverview | null>(null), switchingAccount = ref(false)
  const section = computed(() => ['categories', 'credentials', 'users', 'security', 'team'].includes(String(route.query.section)) ? String(route.query.section) : 'overview')
  const titles: Record<string, string> = { overview: 'Обзор хранилища', categories: 'Категории', credentials: 'Пароли', team:'Команда и роли', users: 'Пользователи', security: 'Безопасность' }
  const navigation = computed(() => [{ label: 'Пароли', icon: 'i-lucide-panels-top-left', defaultOpen: true, children: [
    { label: 'Обзор', icon: 'i-lucide-chart-no-axes-combined', to: '/admin/password', active: section.value === 'overview' },
    { label: 'Категории', icon: 'i-lucide-folders', to: '/admin/password?section=categories', active: section.value === 'categories' },
    { label: 'Пароли', icon: 'i-lucide-key-round', to: '/admin/password?section=credentials', active: section.value === 'credentials' },
    { label: 'Команда и роли', icon:'i-lucide-network',to:'/admin/password?section=team',active:section.value==='team' },
    { label: 'Пользователи', icon: 'i-lucide-users', to: '/admin/password?section=users', active: section.value === 'users' },
    { label: 'Безопасность', icon: 'i-lucide-shield-check', to: '/admin/password?section=security', active: section.value === 'security' }
  ] }])
  async function adminFetch<T>(url: string): Promise<T> {
    return queries.read<T>('admin', url)
  }
  const visibilityBusy=ref('')
  async function setTeamVisibility(user:{id:string;isHidden?:boolean}){
    if(visibilityBusy.value)return
    visibilityBusy.value=user.id;accessError.value=''
    try{const hidden=!user.isHidden,userId=auth.user?.id;await sharedRequest('/api/admin/team/visibility',{method:'PUT',body:{userId:user.id,hidden}});if(auth.user?.id!==userId)return;await queries.invalidate('admin','team','team-search','admin-team-search','team-profile','profile');if(auth.user?.id===userId&&overview.value)overview.value={...overview.value,users:overview.value.users.map(item=>item.id===user.id?{...item,isHidden:hidden}:item)}}catch(failure:any){accessError.value=failure?.data?.message||'Не удалось изменить видимость аккаунта'}finally{visibilityBusy.value=''}
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
  return { setTeamVisibility, visibilityBusy, auth, vault, identity, checking, accessError, overview, section, titles, navigation, restore, switchAccount, switchingAccount, date, productName }
}
