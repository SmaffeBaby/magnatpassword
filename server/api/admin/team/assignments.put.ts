import { z } from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSiteAdmin(event),body=await sharedBody(event,z.object({userId:z.uuid(),roleIds:z.array(z.uuid()).max(100)}).strict())
 const{error}=await context.client.rpc('set_team_assignments',{p_actor:context.user.id,p_user:body.userId,p_roles:[...new Set(body.roleIds)]})
 if(error)throw createError({statusCode:400,message:'Можно назначить только существующие компании, отделы и должности'})
 return {ok:true}
})
