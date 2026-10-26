import { profileSchema,teamProfile } from '../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),body=await sharedBody(event,profileSchema)
 const {error}=await context.client.rpc('update_team_profile',{p_actor:context.user.id,p_profile:body})
 if(error)throw createError({statusCode:503,message:'Не удалось сохранить профиль'})
 return teamProfile(event,context,context.user.id)
})
