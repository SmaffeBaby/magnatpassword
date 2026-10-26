import {decodeShared} from './shared-vaults'
import type { Credential, VaultData } from '../../shared/types/vault'
import { entryCategoryIds } from '../../shared/utils/credentials'

export interface VaultCategoryAccess { vaultId:string; role?:'viewer'|'member'|'manager'; categoryIds:string[]|null; token:string }
export async function loadCategoryAccess(context:Awaited<ReturnType<typeof requireSharedUser>>,event:Parameters<typeof requireSharedUser>[0]):Promise<VaultCategoryAccess[]> {
  const {data,error}=await context.client.from('shared_vault_members').select('vault_id,category_ids,access_token,member_role').eq('user_id',context.user.id)
  if(error)throw createError({statusCode:503,message:'Не удалось проверить доступ к категориям'})
  const access:VaultCategoryAccess[]=data.map(row=>({vaultId:row.vault_id,role:row.member_role,categoryIds:row.category_ids,token:row.access_token}))
  const restricted=access.filter(item=>item.categoryIds!==null)
  if(restricted.length){
    const {data:groups,error:failure}=await context.client.from('shared_vaults').select('id,encrypted_data,key_epoch').in('id',restricted.map(item=>item.vaultId))
    if(failure)throw createError({statusCode:503,message:'Не удалось проверить категории хранилища'})
    for(const grant of restricted){const group=groups.find(group=>group.id===grant.vaultId),ids=new Set(group?decodeShared(event,group).categories.map(category=>category.id):[]);grant.categoryIds=grant.categoryIds!.filter(id=>ids.has(id))}
  }
  return access
}
export function canAccessCategoryEntry(entry:Credential,categoryIds:string[]|null):boolean {
  return categoryIds===null||entryCategoryIds(entry).some(id=>categoryIds.includes(id))
}
export function categoryScopedData(data:VaultData,categoryIds:string[]|null):VaultData {
  if(categoryIds===null)return data
  categoryIds=categoryIds.filter(id=>data.categories.some(category=>category.id===id))
  const categories=data.categories.filter(category=>categoryIds!.includes(category.id)),folderIds=new Set(categories.map(category=>category.folderId).filter(Boolean))
  const entries=data.entries.filter(entry=>canAccessCategoryEntry(entry,categoryIds)),entryIds=new Set(entries.map(entry=>entry.id))
  return {...data,categories,categoryFolders:data.categoryFolders?.filter(folder=>folderIds.has(folder.id)),entries,subscriptionPayments:data.subscriptionPayments?.filter(payment=>entryIds.has(payment.entryId))}
}
export function mergeCategoryScopedData(original:VaultData,candidate:VaultData,categoryIds:string[]|null):VaultData {
  if(categoryIds===null)return candidate
  const visible=categoryScopedData(original,categoryIds)
  const structure=(data:VaultData)=>({name:data.name,svg:data.svg,categories:data.categories,categoryFolders:data.categoryFolders??[]})
  if(JSON.stringify(structure(visible))!==JSON.stringify(structure(candidate)))throw createError({statusCode:403,message:'Категории и папки меняет участник с полным доступом к хранилищу'})
  const ids=new Set(visible.entries.map(entry=>entry.id))
  for(const entry of candidate.entries){
    const previous=visible.entries.find(item=>item.id===entry.id)
    if(!canAccessCategoryEntry(entry,categoryIds)||!previous||JSON.stringify([...entryCategoryIds(entry)].sort())!==JSON.stringify([...entryCategoryIds(previous)].sort()))throw createError({statusCode:403,message:'Нет прав на изменение категорий карточки'})
  }
  if(candidate.subscriptionPayments?.some(payment=>!ids.has(payment.entryId)))throw createError({statusCode:403,message:'Нет доступа к истории этой карточки'})
  return {...original,entries:[...original.entries.filter(entry=>!ids.has(entry.id)),...candidate.entries],subscriptionPayments:[...(original.subscriptionPayments??[]).filter(payment=>!ids.has(payment.entryId)),...(candidate.subscriptionPayments??[])]}
}
export function accessTokens(access:VaultCategoryAccess[]){return Object.fromEntries(access.map(item=>[item.vaultId,item.token]))}
export function assertNewCardAccess(entry:Credential,vaultIds:string[],access:VaultCategoryAccess[]){
  for(const id of vaultIds){const grant=access.find(item=>item.vaultId===id);if(!grant||grant.role==='viewer')throw createError({statusCode:403,message:'Нет доступа к выбранному хранилищу'});if(grant.categoryIds!==null&&(vaultIds.length!==1||!canAccessCategoryEntry(entry,grant.categoryIds)||entryCategoryIds(entry).some(id=>!grant.categoryIds!.includes(id))))throw createError({statusCode:403,message:'Выберите одно хранилище и только разрешённые вам категории'})}
}
