import { z } from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireProjectsUser(event),project=projectId(event)
 const permission=await context.client.rpc('project_permission',{p_actor:context.user.id,p_id:project})
 if(permission.error||!permission.data) throw createError({statusCode:404,message:'Проект недоступен'})
 const spaces=await context.client.rpc('space_catalog',{p_actor:context.user.id,p_project:project})
 if(spaces.error) projectFailure(spaces.error)
 const raw=getQuery(event).space
 if(!raw)return {spaces:spaces.data,objects:[],cursors:[]}
 const space=z.uuid().parse(raw)
 if(!spaces.data?.some((s:{id:string})=>s.id===space))throw createError({statusCode:404,message:'Пространство недоступно'})
 const objects=await context.client.from('project_space_objects').select('*').eq('space_id',space)
 if(objects.error)throw createError({statusCode:503,message:'Не удалось загрузить пространство'})
 return {spaces:spaces.data,objects:objects.data,cursors:[]}
})
