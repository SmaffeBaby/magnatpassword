import {categoryScopedData} from '../../utils/category-access'
import type { SharedVault, SharedMember } from '../../../shared/types/sharing'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { data: memberships, error } = await context.client.from('shared_vault_members').select('vault_id,category_ids,member_role').eq('user_id', context.user.id)
  if (error) throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Не удалось загрузить общие хранилища' })
  if (!memberships.length) return []
  const [{ data: rows, error: failure }, { data: directory, error: directoryError }] = await Promise.all([
    context.client.from('shared_vaults').select('*').in('id', memberships.map(m => m.vault_id)).order('name'),
    context.client.rpc('shared_vault_directory', { p_actor: context.user.id })
  ])
  if (failure || directoryError) throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Не удалось загрузить участников хранилищ' })
  return rows.map(row => ({ id: row.id, name: row.name, ownerId: row.owner_id, revision: row.revision, categoryIds:memberships.find(member=>member.vault_id===row.id)?.category_ids??null,role:memberships.find(member=>member.vault_id===row.id)?.member_role,canEdit:memberships.find(member=>member.vault_id===row.id)?.member_role!=='viewer',canManageMembers:row.owner_id===context.user.id||memberships.find(member=>member.vault_id===row.id)?.member_role==='manager',canManageStructure:memberships.find(member=>member.vault_id===row.id)?.category_ids==null&&memberships.find(member=>member.vault_id===row.id)?.member_role!=='viewer',data:categoryScopedData(decodeShared(event,row),memberships.find(member=>member.vault_id===row.id)?.category_ids??null), members: (directory ?? []).filter((m: any) => m.vault_id === row.id).map((m: any): SharedMember => ({ userId: m.user_id, role:m.member_role,fullName:m.full_name,categoryIds:m.category_ids??null, email: m.email, brand: m.brand })) })) as SharedVault[]
})
