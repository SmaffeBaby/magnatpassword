import { brandForEmail, type AccountBrand } from '~~/shared/utils/branding'

export function useAuthGate(props: { admin?: boolean }) {
  const auth = useAuthStore(), vault = useVaultStore()
  const email = ref(''), password = ref(''), register = ref(false), master = ref('')
  const localError = ref('')
  const { previewBrand } = useAccountBrand()
  const brandOptions = [{ label: 'Magnat', value: 'magnat' }, { label: 'Light', value: 'light' }]
  function toggleRegistration() { register.value = !register.value; auth.error = '' }
  watch([email, register, () => auth.user?.id], (_value, _previous, onCleanup) => {
    if (auth.user || register.value) return
    const value = email.value.trim().toLowerCase()
    previewBrand.value = brandForEmail(value)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await $fetch<{ brand: AccountBrand }>('/api/auth/brand', { method: 'POST', body: { email: value }, signal: controller.signal, timeout: 4000, retry: 0 })
        if (!controller.signal.aborted && !auth.user && !register.value && email.value.trim().toLowerCase() === value) previewBrand.value = result.brand
      } catch { /* Keep the local preview if the lookup is unavailable or was cancelled. */ }
    }, 350)
    onCleanup(() => { clearTimeout(timer); controller.abort() })
  }, { immediate: true })
  watch(() => auth.user?.id, id => { if (id && !props.admin) vault.check() }, { immediate: true })
  async function authenticate() { await auth.authenticate(email.value, password.value, register.value, previewBrand.value); password.value = '' }
  async function openVault() {
    localError.value = ''
    await vault.unlock(master.value); master.value = ''
  }
  return { auth, vault, email, password, register, master, localError, authenticate, openVault, previewBrand, brandOptions, toggleRegistration }
}
