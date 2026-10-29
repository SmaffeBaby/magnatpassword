import { defineStore } from 'pinia'
import type { VaultRole } from '~~/shared/types/team'
import type { SharedCard, SharedVault } from '~~/shared/types/sharing'
import type { SubscriptionPayment } from '~~/shared/types/subscriptions'
import type { VaultData } from '~~/shared/types/vault'
export const useSharedVaultsStore = defineStore('shared-vaults', () => {
  const queries = useAccountQueries()
  const cards=ref<SharedCard[]>([])
  const groups = ref<SharedVault[]>([]), loading = ref(false), busy = ref(false), error = ref('')
  let generation = 0
  const message = (e: any) => e?.data?.message || e?.data?.statusMessage || e?.message || 'Общие хранилища недоступны'
  async function fetchGroups(attempt: number, force = false) {
    const { groups: rows, cards: records } = await queries.read<{ groups: SharedVault[]; cards: SharedCard[] }>('workspace', '/api/workspace', { force })
    if (attempt !== generation || !useVaultStore().unlocked) return false
    groups.value = rows; cards.value=records; return true
  }
  async function refresh(force = false) {
    if (loading.value || busy.value || !useVaultStore().unlocked) return
    const attempt = generation; loading.value = true
    try { if (await fetchGroups(attempt, force)) error.value = '' }
    catch (e) { if (attempt === generation) error.value = message(e) }
    finally { if (attempt === generation) loading.value = false }
  }
  async function mutate<T>(action: () => Promise<T>): Promise<T | null> {
    if (busy.value || loading.value || !useVaultStore().unlocked) return null
    const attempt = generation; busy.value = true; error.value = ''
    try {
      const result = await action()
      if (attempt !== generation) return null
      await queries.invalidate('workspace', 'notifications')
      if (!await fetchGroups(attempt)) return null
      return result
    } catch (e: any) {
      if (attempt === generation) {
        error.value = message(e)
        if ([403, 409].includes(e?.statusCode ?? e?.status)) { try { await fetchGroups(attempt, true) } catch {} }
      }
      return null
    } finally { if (attempt === generation) busy.value = false }
  }
  async function create(name: string): Promise<string | null> {
    const result = await mutate(() => sharedRequest<{ id: string }>('/api/shared-vaults', { method: 'POST', body: { name: name.trim() } }))
    return result?.id ?? null
  }
  function find(id: string) {
    const group = groups.value.find(g => g.id === id)
    if (!group) throw new Error('Нет доступа к хранилищу')
    return group
  }
  async function save(id: string, data: VaultData): Promise<boolean> {
    return !!await mutate(() => sharedRequest(`/api/shared-vaults/${id}`, { method: 'PUT', body: { revision: find(id).revision, data } }))
  }
  async function invite(id: string, email: string, categoryIds:string[]|null=null,role:VaultRole='member',userId?:string): Promise<boolean> {
    return !!await mutate(() => sharedRequest(`/api/shared-vaults/${id}/members`, { method: 'POST', body: { revision: find(id).revision, email: email.trim(), userId, role, categoryIds } }))
  }
  async function permissions(id:string,userId:string,categoryIds:string[]|null,role:VaultRole='member'):Promise<boolean>{return !!await mutate(()=>sharedRequest(`/api/shared-vaults/${id}/members`,{method:'PUT',body:{revision:find(id).revision,userId,categoryIds,role}}))}
  async function revoke(id: string, userId: string): Promise<boolean> {
    return !!await mutate(() => sharedRequest(`/api/shared-vaults/${id}/members`, { method: 'DELETE', body: { revision: find(id).revision, userId } }))
  }
  async function rename(id: string, name: string): Promise<boolean> {
    return !!await mutate(() => sharedRequest(`/api/shared-vaults/${id}`, { method: 'PATCH', body: { revision: find(id).revision, name: name.trim() } }))
  }
  async function saveCard(entry:VaultData['entries'][number],vaultIds:string[]|undefined,id?:string,origin?:{vaultId:string;revision:number},expectedRevision?:number):Promise<boolean>{
    return !!await mutate(()=>sharedRequest(id?`/api/shared-cards/${id}`:'/api/shared-cards',{method:id?'PUT':'POST',body:{entry,...(vaultIds?{vaultIds}:{}),...(id?{revision:expectedRevision??cards.value.find(card=>card.id===id)?.revision}:{}),...(origin?{origin}:{})}}))
  }
  async function renewCard(id:string,fieldId:string){return !!await mutate(()=>sharedRequest(`/api/shared-cards/${id}/renew`,{method:'POST',body:{revision:cards.value.find(card=>card.id===id)?.revision,fieldId}}))}
  async function savePayment(id:string,payment:SubscriptionPayment){return !!await mutate(()=>sharedRequest(`/api/shared-cards/${id}/payments`,{method:'PUT',body:{action:'save',revision:cards.value.find(card=>card.id===id)?.revision,payment}}))}
  async function deletePayment(id:string,paymentId:string){return !!await mutate(()=>sharedRequest(`/api/shared-cards/${id}/payments`,{method:'PUT',body:{action:'delete',revision:cards.value.find(card=>card.id===id)?.revision,paymentId}}))}
  async function deleteCard(id:string){return !!await mutate(()=>sharedRequest(`/api/shared-cards/${id}`,{method:'DELETE',body:{revision:cards.value.find(card=>card.id===id)?.revision}}))}
  async function migrateSubscriptions(){return await mutate(()=>sharedRequest<{migrated:number}>('/api/finance-subscriptions/migrate',{method:'POST'}))}
  function lock() { generation++; groups.value = []; cards.value=[]; busy.value = false; loading.value = false; error.value = '' }
  return { migrateSubscriptions, permissions, savePayment, deletePayment, cards, saveCard, renewCard, deleteCard, groups, loading, busy, error, refresh, create, save, invite, revoke, rename, lock }
})
