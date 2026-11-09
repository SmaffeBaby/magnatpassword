import { z } from 'zod'
import type { H3Event } from 'h3'
import { kabanFailure } from './kaban'
export const kabanCategorySchema = z.object({ name:z.string().trim().min(1).max(60),color:z.string().regex(/^#[\da-fA-F]{6}$/),parentId:z.string().min(1).max(128).nullable() }).strict()
export async function writeKabanCategory(event:H3Event,id:string,create=false){
 const context=await requireSharedUser(event)
 if(!id||id.length>128)throw createError({statusCode:400,message:'Некорректная категория.'})
 const body=await sharedBody(event,z.object({boardId:z.uuid(),revision:create?z.literal(0):z.number().int().positive(),data:kabanCategorySchema}).strict())
 const {error}=await context.client.rpc('kaban_category_mutate',{p_actor:context.user.id,p_board:body.boardId,p_id:id,p_revision:body.revision,p_data:body.data})
 if(error)kabanFailure(error)
 return {id}
}
