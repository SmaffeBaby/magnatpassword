import {z} from 'zod'
export default defineEventHandler(async event=>{
 const {context,space}=await spaceAssetContext(event,true),body=await sharedBody(event,z.object({ids:z.array(z.uuid()).max(100)}).strict())
 if(!body.ids.length)return {ok:true}
 const result=await context.client.from('project_space_objects').delete().eq('space_id',space).eq('data->>kind','stroke').in('id',body.ids)
 if(result.error)throw createError({statusCode:503,message:'Не удалось стереть рисунок'})
 return {ok:true}
})
