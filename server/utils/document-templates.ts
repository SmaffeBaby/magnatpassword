import type { H3Event } from 'h3'
import { z } from 'zod'
import type { DocumentTemplateInput,DocumentTemplateSummary,DocumentTemplate,DocumentTemplateList } from '../../shared/types/document-templates'
import { documentTemplateKindLabel,documentTemplateQuerySchema,templateSearchMatches } from '../../shared/utils/document-templates'
import { executionTemplateSchema } from '../../shared/utils/project-execution'
import { projectFailure,requireProjectsUser } from './projects'
import { openSharedVault,sealSharedVault } from './shared-crypto'
import { sharedSecret } from './shared-vaults'
export function templateFailure(error:{message:string;code?:string}){
 if(error.message.includes('TEMPLATE_NOT_FOUND'))throw createError({statusCode:404,message:'Шаблон не найден'})
 if(error.message.includes('TEMPLATE_AUTHOR_REQUIRED'))throw createError({statusCode:403,message:'Редактировать общий шаблон может только его автор. Создайте свою копию.'})
 if(error.message.includes('TEMPLATE_KIND_FIXED'))throw createError({statusCode:400,message:'Этап и тип сохранённого шаблона менять нельзя. Создайте новый шаблон.'})
 if(error.code==='23505')throw createError({statusCode:409,message:'Шаблон уже существует. Обновите список.'})
 projectFailure(error)
}
const summarySchema=z.object({name:z.string().min(1).max(120),description:z.string().max(500),title:z.string().max(200),excerpt:z.string().max(200)}).strict()
function decodeSummary(event:H3Event,row:any):DocumentTemplateSummary{
 const summary=summarySchema.parse(openSharedVault(row.summary,sharedSecret(event),`document-template-summary:${row.id}`,1))
 return {id:row.id,stage:row.stage,kind:row.kind,ownerId:row.ownerId,author:row.author,canEdit:row.canEdit,revision:row.revision,updatedAt:row.updatedAt,...summary}
}
export function documentTemplateId(event:H3Event){const result=z.uuid().safeParse(getRouterParam(event,'templateId'));if(!result.success)throw createError({statusCode:400,message:'Некорректный шаблон'});return result.data}
export async function listDocumentTemplates(event:H3Event):Promise<DocumentTemplateList>{
 const context=await requireProjectsUser(event),parsed=documentTemplateQuerySchema.safeParse(getQuery(event));if(!parsed.success)throw createError({statusCode:400,message:'Проверьте параметры поиска шаблонов'})
 const query=parsed.data,{data,error}=await context.client.rpc('project_document_template_list',{p_actor:context.user.id,p_stage:query.stage});if(error)templateFailure(error)
 const rows=(data as any[]).map(row=>decodeSummary(event,row)).filter(row=>(!query.kind||row.kind===query.kind)&&(query.owner!=='mine'||row.ownerId===context.user.id)&&templateSearchMatches(`${row.name} ${row.description} ${row.title} ${row.author} ${documentTemplateKindLabel(row.kind)}`,query.q)),pageSize=24
 return {items:rows.slice((query.page-1)*pageSize,query.page*pageSize),total:rows.length,page:query.page,pageSize}
}
export async function readDocumentTemplate(event:H3Event,id:string):Promise<DocumentTemplate>{
 const context=await requireProjectsUser(event),{data,error}=await context.client.rpc('project_document_template_read',{p_actor:context.user.id,p_id:id});if(error)templateFailure(error)
 return {...decodeSummary(event,data),template:executionTemplateSchema.parse(openSharedVault(data.data,sharedSecret(event),`document-template:${id}`,1))}
}
export async function writeDocumentTemplate(event:H3Event,id:string,revision:number,input:DocumentTemplateInput){
 const context=await requireProjectsUser(event),summary={name:input.name,description:input.description,title:input.template.title,excerpt:input.template.body.slice(0,200)}
 const {error}=await context.client.rpc('project_document_template_write',{p_actor:context.user.id,p_id:id,p_revision:revision,p_stage:input.stage,p_kind:input.kind,p_summary:sealSharedVault(summary,sharedSecret(event),`document-template-summary:${id}`,1),p_data:sealSharedVault(input.template,sharedSecret(event),`document-template:${id}`,1)})
 if(error)templateFailure(error)
 return {id}
}
