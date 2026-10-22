import { defineStore } from 'pinia'
import type { User } from '@supabase/supabase-js'
import { normalizeAccountBrand, type AccountBrand } from '~~/shared/utils/branding'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const checking = ref(true), pending = ref(false), error = ref('')
  const client = () => useNuxtApp().$supabase
  async function restore() {
    try { const { data } = await client().auth.getSession(); user.value = data.session?.user ?? null }
    finally { checking.value = false }
  }
  async function authenticate(email: string, password: string, register = false, brand: AccountBrand = 'magnat') {
    pending.value = true; error.value = ''
    try {
      const { data, error: failure } = register
        ? await client().auth.signUp({ email: email.trim(), password, options: { data: { account_brand: normalizeAccountBrand(brand) } } })
        : await client().auth.signInWithPassword({ email: email.trim(), password })
      if (failure) throw new Error(register ? 'Не удалось создать аккаунт. Проверьте email и пароль или попробуйте войти.' : 'Не удалось войти. Проверьте email и пароль.')
      user.value = data.session?.user ?? null
      if (!data.session) error.value = 'Подтвердите email по ссылке в письме, затем войдите.'
    } catch (e) { error.value = e instanceof Error ? e.message : 'Сервис недоступен' }
    finally { pending.value = false }
  }
  async function logout() {
    useVaultStore().lock()
    const { error: failure } = await client().auth.signOut({ scope: 'local' })
    if (failure) { error.value = 'Не удалось завершить сессию. Повторите выход.'; return }
    user.value = null
  }
  return { user, checking, pending, error, restore, authenticate, logout }
})
