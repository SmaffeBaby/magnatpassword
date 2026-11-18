import type {H3Event} from 'h3'
import {z} from 'zod'
export async function spaceAssetContext(event:H3Event,write=false){
 const context=await requireProjectsUser(event),project=projectId(event),parsed=z.uuid().safeParse(getRouterParam(event,'spaceId')||getQuery(event).space)
 if(!parsed.success)throw createError({statusCode:400,message:'Выберите пространство'})
 const space=parsed.data,row=await context.client.from('project_spaces').select('project_id').eq('id',space).maybeSingle()
 if(row.error||row.data?.project_id!==project)throw createError({statusCode:404,message:'Пространство недоступно'})
 const rights=await context.client.rpc('space_permission',{p_actor:context.user.id,p_space:space})
 if(rights.error||!rights.data||write&&!['owner','editor'].includes(rights.data))throw createError({statusCode:403,message:'Нет доступа к пространству'})
 return {context,project,space}
}
