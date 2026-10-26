import { randomUUID } from 'node:crypto'
import { MAX_AVATAR_BYTES,avatarMime } from '../../../shared/utils/team'
import { teamProfile } from '../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),parts=await readMultipartFormData(event)
 const files=parts?.filter(part=>part.name==='avatar')??[]
 if(files.length!==1||!files[0]?.data.length)throw createError({statusCode:400,message:'Выберите изображение'})
 const file=files[0]
 if(file.data.length>MAX_AVATAR_BYTES)throw createError({statusCode:413,message:'Аватар должен быть не больше 2 МБ'})
 const mime=avatarMime(file.data)
 if(!mime||mime!==file.type)throw createError({statusCode:400,message:'Поддерживаются изображения PNG, JPEG и WebP'})
 const path=`${context.user.id}/${randomUUID()}.${mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp'}`
 const {data:previous}=await context.client.from('team_profiles').select('avatar_path').eq('user_id',context.user.id).single()
 const upload=await context.client.storage.from('profile-avatars').upload(path,file.data,{contentType:mime,upsert:false,cacheControl:'3600'})
 if(upload.error)throw createError({statusCode:503,message:'Не удалось загрузить аватар'})
 const {error}=await context.client.from('team_profiles').update({avatar_path:path,updated_at:new Date().toISOString()}).eq('user_id',context.user.id)
 if(error){await context.client.storage.from('profile-avatars').remove([path]);throw createError({statusCode:503,message:'Не удалось сохранить аватар'})}
 if(previous?.avatar_path)await context.client.storage.from('profile-avatars').remove([previous.avatar_path])
 return teamProfile(event,context,context.user.id)
})
