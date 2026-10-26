import { teamProfile } from '../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),{data:previous}=await context.client.from('team_profiles').select('avatar_path').eq('user_id',context.user.id).single()
 const{error}=await context.client.from('team_profiles').update({avatar_path:null,updated_at:new Date().toISOString()}).eq('user_id',context.user.id)
 if(error)throw createError({statusCode:503,message:'Не удалось удалить аватар'})
 if(previous?.avatar_path)await context.client.storage.from('profile-avatars').remove([previous.avatar_path])
 return teamProfile(event,context,context.user.id)
})
