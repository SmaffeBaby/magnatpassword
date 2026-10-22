export function useAuthGate(props: { admin?: boolean }) {
  const auth = useAuthStore(), vault = useVaultStore()
  const email = ref(''), password = ref(''), register = ref(false), master = ref(''), confirmation = ref('')
  const localError = ref('')
  const { previewBrand } = useAccountBrand()
  const brandOptions = [{ label: 'Magnat', value: 'magnat' }, { label: 'Light', value: 'light' }]
  function toggleRegistration() { register.value = !register.value; auth.error = ''; if (!register.value) previewBrand.value = 'magnat' }
  watch(() => auth.user?.id, id => { if (id && !props.admin) vault.check() }, { immediate: true })
  async function authenticate() { await auth.authenticate(email.value, password.value, register.value, previewBrand.value); password.value = '' }
  async function openVault() {
    localError.value = ''
    if (!vault.exists && master.value !== confirmation.value) { localError.value = 'Мастер-пароли не совпадают'; return }
    await vault.unlock(master.value); master.value = ''; confirmation.value = ''
  }
  return { auth, vault, email, password, register, master, confirmation, localError, authenticate, openVault, previewBrand, brandOptions, toggleRegistration }
}
