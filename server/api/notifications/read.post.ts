import { z } from 'zod'
export default defineEventHandler(async event=>{
  const context=await requireSharedUser(event),body=await sharedBody(event,z.object({ids:z.array(z.uuid()).max(100)}).strict())
  if(!body.ids.length)return {ok:true}
  const {error}=await context.client.from('app_notifications').update({read_at:new Date().toISOString()}).eq('user_id',context.user.id).is('dismissed_at',null).in('id',body.ids)
  if(error)throw createError({statusCode:503,statusMessage:'Notifications unavailable'})
  return {ok:true}
})
