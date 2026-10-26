import { defineStore } from 'pinia'
import type { VaultData } from '~~/shared/types/vault'
type VaultResponse = { migrationRequired: true } | { migrationRequired: false; data: VaultData; revision: number }
const emptyVault = (): VaultData => ({ version: 1, entries: [], categories: [] })
export const useVaultStore = defineStore('vault', () => {
  const queries = useAccountQueries()
  const data = ref<VaultData>(emptyVault()), unlocked = ref(false), exists = ref(false), checking = ref(false), busy = ref(false), error = ref(''), migrationRequired = ref(false)
  let revision = 0, generation = 0
  const message = (e: any) => e?.data?.message || e?.message || 'Хранилище недоступно'
  function apply(result: VaultResponse) {
    exists.value = true; migrationRequired.value = result.migrationRequired
    if (!result.migrationRequired) { data.value = result.data; revision = result.revision; unlocked.value = true }
  }
  async function check() {
    const attempt = generation; checking.value = true; error.value = ''
    try { const result = await queries.read<VaultResponse>('personal', '/api/personal-vault'); if (attempt === generation) apply(result) }
    catch (e) { if (attempt === generation) error.value = message(e) }
    finally { if (attempt === generation) checking.value = false }
  }
  async function unlock(password = '') {
    const attempt = generation; busy.value = true; error.value = ''
    try {
      const result = migrationRequired.value
        ? await sharedRequest<VaultResponse>('/api/personal-vault/migrate', { method: 'POST', body: { password } })
        : await queries.read<VaultResponse>('personal', '/api/personal-vault')
      if (attempt === generation) { queries.set('personal', '/api/personal-vault', result); apply(result) }
    } catch (e) { if (attempt === generation) error.value = message(e) }
    finally { if (attempt === generation) busy.value = false }
  }
  async function save(next: VaultData): Promise<boolean> {
    if (!unlocked.value || busy.value) return false
    const attempt = generation; busy.value = true; error.value = ''
    try {
      const result = await sharedRequest<{ revision: number }>('/api/personal-vault', { method: 'PUT', body: { data: next, revision } })
      if (attempt !== generation) return false
      data.value = next; revision = result.revision
      queries.set<VaultResponse>('personal', '/api/personal-vault', { migrationRequired: false, data: next, revision })
      await queries.invalidate('notifications')
      return true
    } catch (e) { if (attempt === generation) error.value = message(e); return false }
    finally { if (attempt === generation) busy.value = false }
  }
  function lock() { queries.clear(); generation++; revision = 0; data.value = emptyVault(); unlocked.value = false; checking.value = false; busy.value = false; error.value = ''; migrationRequired.value = false; exists.value = false }
  async function exportEncrypted() {
    try {
      const result = await sharedRequest('/api/personal-vault/backup')
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = `magnat-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
    } catch (e) { error.value = message(e) }
  }
  return { getRevision:()=>revision, data, unlocked, exists, checking, busy, error, migrationRequired, check, unlock, save, lock, exportEncrypted }
})
