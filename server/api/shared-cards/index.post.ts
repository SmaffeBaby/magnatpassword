import {assertNewCardAccess,loadCategoryAccess,canAccessCategoryEntry} from '../../utils/category-access'
import {entryCategoryIds} from '../../../shared/utils/credentials'
import {randomUUID} from 'node:crypto'
import {sealSharedVault} from '../../utils/shared-crypto'
export default defineEventHandler(async event=>{
 const base=await requireSharedUser(event),context={...base,access:await loadCategoryAccess(base,event)},body=await sharedBody(event,cardInputSchema),id=randomUUID()
 if(!body.origin)assertNewCardAccess(body.entry,[...new Set(body.vaultIds??[])],context.access)
 else if(body.origin.vaultId==='personal')assertNewCardAccess(body.entry,[...new Set(body.vaultIds??[])],context.access)
 const payload:Record<string,unknown>={encryptedData:sealCard(event,id,body.entry,[]),vaultIds:[...new Set(body.vaultIds??[])]}
 if(body.origin){
  let original,revision:number,encrypted
  if(body.origin.vaultId==='personal'){
   const row=await personalRow(context)
   if(!row||row.encryption_mode!=='server')throw createError({statusCode:403,message:'Личное хранилище недоступно'})
   original=openPersonal(event,row);revision=row.revision
   if(!original.entries.some(entry=>entry.id===body.entry.id))throw createError({statusCode:404,message:'Карточка не найдена'})
   const payments=original.subscriptionPayments?.filter(payment=>payment.entryId===body.entry.id)??[]
   original.subscriptionPayments=original.subscriptionPayments?.filter(payment=>payment.entryId!==body.entry.id)
   payload.encryptedData=sealCard(event,id,body.entry,payments)
   original.entries=original.entries.filter(entry=>entry.id!==body.entry.id)
   encrypted=sealPersonal(event,original,context.user.id)
  }else{
   const membership=await context.client.from('shared_vault_members').select('user_id').eq('vault_id',body.origin.vaultId).eq('user_id',context.user.id).maybeSingle()
   if(!membership.data)throw createError({statusCode:403,message:'Нет доступа к исходному хранилищу'})
   const {data:row}=await context.client.from('shared_vaults').select('*').eq('id',body.origin.vaultId).single()
   if(!row)throw createError({statusCode:403,message:'Нет доступа к исходному хранилищу'})
   original=decodeShared(event,row);revision=row.revision
   const grant=context.access.find(item=>item.vaultId===row.id),previous=original.entries.find(entry=>entry.id===body.entry.id)
   if(!grant||!previous||!canAccessCategoryEntry(previous,grant.categoryIds))throw createError({statusCode:403,message:'Нет доступа к исходной карточке'})
   if(grant.categoryIds!==null&&((body.vaultIds??[]).length!==1||body.vaultIds?.[0]!==row.id||JSON.stringify([...entryCategoryIds(body.entry)].sort())!==JSON.stringify([...entryCategoryIds(previous)].sort())))throw createError({statusCode:403,message:'Нет прав на изменение категорий и хранилищ карточки'})
   if(!original.entries.some(entry=>entry.id===body.entry.id))throw createError({statusCode:404,message:'Карточка не найдена'})
   const payments=original.subscriptionPayments?.filter(payment=>payment.entryId===body.entry.id)??[]
   original.subscriptionPayments=original.subscriptionPayments?.filter(payment=>payment.entryId!==body.entry.id)
   payload.encryptedData=sealCard(event,id,body.entry,payments)
   original.entries=original.entries.filter(entry=>entry.id!==body.entry.id)
   encrypted=sealSharedVault(original,sharedSecret(event),row.id,row.key_epoch)
  }
  if(revision!==body.origin.revision)throw createError({statusCode:409,message:'Хранилище изменилось. Обновите страницу.'})
  Object.assign(payload,{originVault:body.origin.vaultId,originRevision:revision,originEncrypted:encrypted})
 }
 if(body.origin&&body.origin.vaultId!=='personal'){
  const originGrant=context.access.find(item=>item.vaultId===body.origin!.vaultId)
  if(originGrant?.categoryIds===null)assertNewCardAccess(body.entry,[...new Set(body.vaultIds??[])],context.access)
 }
 await mutateCard(context,id,0,payload)
 return {id}
})
