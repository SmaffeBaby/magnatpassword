import { z } from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSiteAdmin(event),body=await sharedBody(event,z.object({userId:z.uuid(),hidden:z.boolean()}).strict())
 const {data,error}=await context.client.from('team_profiles').update({is_hidden:body.hidden,updated_at:new Date().toISOString()}).eq('user_id',body.userId).select('user_id').maybeSingle()
 if(error)throw createError({statusCode:503,message:'Не удалось изменить видимость аккаунта'})
 if(!data)throw createError({statusCode:404,message:'Аккаунт не найден'})
 return {ok:true}
})
