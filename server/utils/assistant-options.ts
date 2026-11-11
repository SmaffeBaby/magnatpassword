import { requireSharedUser } from './shared-vaults'
import type { H3Event } from 'h3'
export async function assistantVaultOptions(event: H3Event) {
  const context = await requireSharedUser(event)
  const { data: memberships, error } = await context.client.from('shared_vault_members').select('vault_id,member_role').eq('user_id', context.user.id)
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить хранилища.' })
  const ids = (memberships || []).map(row => row.vault_id)
  const { data: groups, error: failure } = ids.length ? await context.client.from('shared_vaults').select('id,name').in('id', ids) : { data: [], error: null }
  if (failure) throw createError({ statusCode: 503, message: 'Не удалось загрузить хранилища.' })
  return [{ id: 'personal', label: 'Личное', disabled: false }, ...(groups || []).map(group => ({ id: group.id, label: group.name, disabled: memberships!.find(member => member.vault_id === group.id)?.member_role === 'viewer' }))]
}
