import { unitSchema } from '../../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSiteAdmin(event),body=await sharedBody(event,unitSchema)
 const row={name:body.name,kind:body.kind,parent_id:body.parentId,brand:body.kind==='company'?body.brand??null:null}
 const result=body.id?await context.client.from('team_units').update(row).eq('id',body.id).select('id').single():await context.client.from('team_units').insert(row).select('id').single()
 if(result.error)throw createError({statusCode:400,message:'Проверьте родительский отдел, компанию и уникальность названия'})
 return {id:result.data.id}
})
