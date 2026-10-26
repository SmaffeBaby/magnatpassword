import { categoryScopedData, type VaultCategoryAccess } from '../utils/category-access'
import type { SharedVault, SharedMember } from '../../shared/types/sharing'

// Load membership and vault data once for both the sidebar and shared cards.
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { data: memberships, error } = await context.client.from('shared_vault_members').select('vault_id,category_ids,access_token,member_role').eq('user_id', context.user.id)
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить общие хранилища' })
  if (!memberships.length) return { groups: [], cards: await visibleSharedCards(event, context, []) }
  const [{ data: rows, error: failure }, { data: directory, error: directoryError }] = await Promise.all([
    context.client.from('shared_vaults').select('*').in('id', memberships.map(member => member.vault_id)).order('name'),
    context.client.rpc('shared_vault_directory', { p_actor: context.user.id })
  ])
  if (failure || directoryError) throw createError({ statusCode: 503, message: 'Не удалось загрузить общие хранилища' })
  const access: VaultCategoryAccess[] = []
  const groups: SharedVault[] = rows.map(row => {
    const membership = memberships.find(member => member.vault_id === row.id)!
    const data = decodeShared(event, row)
    const categoryIds = membership.category_ids === null ? null : (membership.category_ids as string[]).filter(id => data.categories.some(category => category.id === id))
    access.push({ vaultId: row.id, categoryIds, role: membership.member_role, token: membership.access_token })
    return { id: row.id, name: row.name, ownerId: row.owner_id, revision: row.revision, categoryIds, role:membership.member_role,canEdit:membership.member_role!=='viewer',canManageMembers:row.owner_id===context.user.id||membership.member_role==='manager',canManageStructure: categoryIds === null&&membership.member_role!=='viewer', data: categoryScopedData(data, categoryIds), members: (directory ?? []).filter((member: any) => member.vault_id === row.id).map((member: any): SharedMember => ({ userId: member.user_id, role:member.member_role,fullName:member.full_name,categoryIds: member.category_ids ?? null, email: member.email, brand: member.brand })) }
  })
  return { groups, cards: await visibleSharedCards(event, context, access) }
})
