import { brandForEmail, type AccountBrand } from '~~/shared/utils/branding'
import type { SavedAccount } from '~/utils/saved-accounts'

export function useAuthGate(props: { admin?: boolean }) {
  const auth = useAuthStore(), vault = useVaultStore()
  const email = ref(''), password = ref(''), register = ref(false), master = ref('')
  const localError = ref('')
  const remember = ref(true), formVisible = ref(false)
  const selectedAccount = ref<SavedAccount | null>(null)
  const showAccounts = computed(() => !register.value && !formVisible.value && auth.savedAccounts.length > 0)
  async function chooseAccount(account: SavedAccount) {
    if (auth.pending) return
    selectedAccount.value = account; email.value = account.email; password.value = ''
    register.value = false; remember.value = true; auth.error = ''
    if (auth.hasQuickLogin(account.id) && await auth.resumeAccount(account.id)) return
    formVisible.value = true
  }
  function otherAccount() {
    selectedAccount.value = null; email.value = ''; password.value = ''
    register.value = false; remember.value = true; formVisible.value = true; auth.error = ''
  }
  function backToAccounts() {
    selectedAccount.value = null; email.value = ''; password.value = ''
    register.value = false; formVisible.value = false; auth.error = ''
  }
  watch(() => auth.user?.id, (id, previous) => { if (!id && previous) backToAccounts() })
  const { previewBrand } = useAccountBrand()
  const brandOptions = [{ label: 'Magnat', value: 'magnat' }, { label: 'Light', value: 'light' }]
  function toggleRegistration() { register.value = !register.value; selectedAccount.value = null; password.value = ''; auth.error = '' }
  watch([email, register, () => auth.user?.id], (_value, _previous, onCleanup) => {
    if (auth.user || register.value) return
    const value = email.value.trim().toLowerCase()
    previewBrand.value = brandForEmail(value)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await backendFetch<{ brand: AccountBrand }>('/api/auth/brand', { method: 'POST', body: { email: value }, signal: controller.signal, timeout: 4000, retry: 0 })
        if (!controller.signal.aborted && !auth.user && !register.value && email.value.trim().toLowerCase() === value) previewBrand.value = result.brand
      } catch { /* Keep the local preview if the lookup is unavailable or was cancelled. */ }
    }, 350)
    onCleanup(() => { clearTimeout(timer); controller.abort() })
  }, { immediate: true })
  watch(() => auth.user?.id, id => { if (id && !props.admin) vault.check() }, { immediate: true })
  async function authenticate() {
    const success = await auth.authenticate(email.value, password.value, register.value, previewBrand.value, remember.value)
    if (success || register.value) password.value = ''
  }
  async function openVault() {
    localError.value = ''
    await vault.unlock(master.value); master.value = ''
  }
  return { auth, vault, email, password, register, master, localError, authenticate, openVault, previewBrand, brandOptions, toggleRegistration,
    remember, selectedAccount, showAccounts, chooseAccount, otherAccount, backToAccounts }
}
