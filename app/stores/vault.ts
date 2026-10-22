import { defineStore } from 'pinia'
import { createSalt, deriveKey, encryptVault, decryptVault } from '~~/shared/utils/crypto'
import type { VaultData } from '~~/shared/types/vault'
const emptyVault = (): VaultData => ({ version: 1, entries: [], categories: [
  { id: 'work', name: 'Работа', icon: 'i-lucide-briefcase-business', color: '#6366f1' },
  { id: 'personal', name: 'Личное', icon: 'i-lucide-user-round', color: '#10b981' },
  { id: 'finance', name: 'Финансы', icon: 'i-lucide-landmark', color: '#f59e0b' },
  { id: 'apps', name: 'Приложения', icon: 'i-lucide-app-window', color: '#ec4899' }
] })
export const useVaultStore = defineStore('vault', () => {
  const data = ref<VaultData>(emptyVault()), unlocked = ref(false), exists = ref(false), checking = ref(false), busy = ref(false), error = ref('')
  let key: CryptoKey | null = null, revision = 0, generation = 0
  const client = () => useNuxtApp().$supabase
  const owner = () => { const id = useAuthStore().user?.id; if (!id) throw new Error('Войдите в аккаунт'); return id }
  async function check() {
    checking.value = true; error.value = ''
    try { const { data: row, error: failure } = await client().from('vaults').select('user_id').eq('user_id', owner()).maybeSingle(); if (failure) throw failure; exists.value = !!row }
    catch { error.value = 'Не удалось подключиться к хранилищу. Проверьте Supabase и повторите.' }
    finally { checking.value = false }
  }
  async function unlock(password: string) {
    busy.value = true; error.value = ''; const attempt = generation
    try {
      if (!globalThis.crypto?.subtle) throw new Error('Откройте сайт по HTTPS или localhost: шифрование недоступно по обычному HTTP.')
      const id = owner()
      const { data: row, error: failure } = await client().from('vaults').select('*').eq('user_id', id).maybeSingle()
      if (failure) throw new Error('Не удалось загрузить хранилище')
      const nextSalt = row?.salt ?? createSalt()
      if (!row && password.length < 12) throw new Error('Мастер-пароль должен содержать не меньше 12 символов')
      const nextKey = await deriveKey(password, nextSalt)
      let plain: VaultData
      if (row) {
        try { plain = await decryptVault(row.encrypted_data, nextKey, id) } catch { throw new Error('Неверный мастер-пароль или повреждённое хранилище') }
      } else {
        plain = emptyVault()
        const encrypted = await encryptVault(plain, nextKey, id)
        const { error: insertError } = await client().from('vaults').insert({ user_id: id, salt: nextSalt, encrypted_data: encrypted })
        if (insertError) throw new Error('Не удалось создать хранилище. Обновите страницу и повторите.')
      }
      if (attempt !== generation || useAuthStore().user?.id !== id) return
      key = nextKey; revision = row?.revision ?? 1; data.value = plain; exists.value = true; unlocked.value = true
    } catch (e) { error.value = e instanceof Error ? e.message : 'Ошибка хранилища' }
    finally { busy.value = false }
  }
  async function save(next: VaultData): Promise<boolean> {
    if (!key || !unlocked.value || busy.value) return false
    busy.value = true; error.value = ''; const attempt = generation
    try {
      const id = owner(); const encrypted = await encryptVault(next, key, id)
      if (attempt !== generation) return false
      const { data: row, error: failure } = await client().from('vaults').update({ encrypted_data: encrypted, revision: revision + 1, updated_at: new Date().toISOString() }).eq('user_id', id).eq('revision', revision).select('revision').maybeSingle()
      if (failure) throw new Error('Не удалось сохранить изменения. Проверьте соединение и повторите.')
      if (!row) throw new Error('Хранилище изменилось в другой вкладке. Заблокируйте и откройте его снова, затем повторите изменение.')
      if (attempt !== generation) return false
      revision = row.revision; data.value = next; return true
    } catch (e) { error.value = e instanceof Error ? e.message : 'Ошибка сохранения'; return false }
    finally { busy.value = false }
  }
  function lock() { generation++; key = null; revision = 0; data.value = emptyVault(); unlocked.value = false; error.value = '' }
  async function exportEncrypted() {
    const { data: row, error: failure } = await client().from('vaults').select('salt,encrypted_data,revision,updated_at').eq('user_id', owner()).single()
    if (failure) { error.value = 'Не удалось выгрузить резервную копию'; return }
    const blob = new Blob([JSON.stringify({ format: 'magnat-password-v1', owner: owner(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }, ...row }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `magnat-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  return { data, unlocked, exists, checking, busy, error, check, unlock, save, lock, exportEncrypted }
})
