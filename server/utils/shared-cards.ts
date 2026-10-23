import { z } from 'zod'
import type {H3Event} from 'h3'
import type {SharedCard} from '../../shared/types/sharing'
import {openSharedVault,sealSharedVault} from './shared-crypto'
export const cardInputSchema=z.object({entry:credentialSchema,vaultIds:z.array(z.uuid()).max(20).optional(),origin:z.object({vaultId:z.union([z.literal('personal'),z.uuid()]),revision:revisionSchema}).strict().optional()}).strict()
export async function visibleSharedCards(event:H3Event,context:Awaited<ReturnType<typeof requireSharedUser>>):Promise<SharedCard[]> {
 const membership=await context.client.from('shared_vault_members').select('vault_id').eq('user_id',context.user.id)
 if(membership.error)throw createError({statusCode:503,message:'Не удалось загрузить доступ к карточкам'})
 const ids=membership.data.map(item=>item.vault_id)
 const linked=ids.length?await context.client.from('shared_card_vaults').select('card_id').in('vault_id',ids):{data:[],error:null}
 if(linked.error)throw createError({statusCode:503,message:'Не удалось загрузить карточки'})
 const own=await context.client.from('shared_cards').select('*').eq('owner_id',context.user.id).eq('is_personal',true)
 const shared=linked.data.length?await context.client.from('shared_cards').select('*').in('id',[...new Set(linked.data.map(item=>item.card_id))]):{data:[],error:null}
 if(own.error||shared.error)throw createError({statusCode:503,message:'Не удалось загрузить карточки'})
 const rows=[...own.data,...shared.data],relations=rows.length?await context.client.from('shared_card_vaults').select('*').in('card_id',rows.map(row=>row.id)):{data:[],error:null}
 if(relations.error)throw createError({statusCode:503,message:'Не удалось загрузить карточки'})
 return rows.map(row=>{
  const all=relations.data.filter(link=>link.card_id===row.id).map(link=>link.vault_id).sort()
  const data=sharedDataSchema.parse(openSharedVault(row.encrypted_data,sharedSecret(event),`card:${row.id}`,1))
  return {id:row.id,archived:row.archived,revision:row.revision,ownerId:row.owner_id,vaultIds:all.filter(id=>ids.includes(id)),canManageSharing:row.owner_id===context.user.id&&all.every(id=>ids.includes(id)),entry:data.entries[0]!,payments:data.subscriptionPayments??[]}
 })
}
export async function requireCard(event:H3Event) {
 const context=await requireSharedUser(event),id=sharedId(event),card=(await visibleSharedCards(event,context)).find(card=>card.id===id)
 if(!card||card.archived)throw createError({statusCode:403,message:'Нет доступа к карточке'})
 return {...context,id,card}
}
export function sealCard(event:H3Event,id:string,entry:SharedCard['entry'],payments:SharedCard['payments']){
 return sealSharedVault({version:1,categories:[],entries:[entry],subscriptionPayments:payments},sharedSecret(event),`card:${id}`,1)
}
export async function mutateCard(context:Awaited<ReturnType<typeof requireSharedUser>>,id:string,revision:number,payload:Record<string,unknown>){
 const {error}=await context.client.rpc('shared_card_mutate',{p_actor:context.user.id,p_id:id,p_revision:revision,p_payload:payload})
 if(error){const conflict=error.message.includes('REVISION_CONFLICT'),denied=/ACCESS_DENIED|OWNER_REQUIRED/.test(error.message);throw createError({statusCode:conflict?409:denied?403:503,message:conflict?'Карточка изменилась. Обновите данные и повторите действие.':denied?'Нет прав на изменение доступа к карточке':'Не удалось сохранить карточку'})}
 return {ok:true}
}
