import { z } from 'zod'

const schema=z.object({space:z.uuid(),id:z.uuid(),action:z.enum(['create','rename','delete-space','put','delete','cursor','leave','access','reply']),revision:z.number().int().min(0).default(0),data:spaceObjectDataSchema.refine(validSpaceObjectSize).default({})}).strict()
export default defineEventHandler(async event=>{
 const context=await requireProjectsUser(event), project=projectId(event), body=await sharedBody(event,schema)
 if(['create','rename'].includes(body.action)&&!body.data.name) throw createError({statusCode:400,message:'Укажите название'})
 if(body.action==='put'&&(!body.data.kind||body.data.x===undefined||body.data.y===undefined)) throw createError({statusCode:400,message:'Некорректный объект'})
 if(body.action==='access'&&(!body.data.userId||!body.data.permission))throw createError({statusCode:400,message:'Укажите участника и права'})
 if(body.action==='reply'&&!body.data.text?.trim())throw createError({statusCode:400,message:'Введите комментарий'})
 if(body.action==='put'&&body.data.kind==='space'){const target=await context.client.from('project_spaces').select('id').eq('id',body.data.targetSpace||'00000000-0000-4000-8000-000000000000').eq('project_id',project).maybeSingle();if(!target.data||body.data.targetSpace===body.space)throw createError({statusCode:400,message:'Выберите другое пространство проекта'})}
 const result=await context.client.rpc('space_mutate',{p_actor:context.user.id,p_project:project,p_space:body.space,p_id:body.id,p_action:body.action,p_revision:body.revision,p_data:body.data})
 if(result.error) projectFailure(result.error)
 return {ok:true}
})
