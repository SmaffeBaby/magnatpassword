import {z} from 'zod'
import {randomUUID} from 'node:crypto'
export default defineEventHandler(async event=>{
 const body=await sharedBody(event,z.object({mode:z.enum(['copy','move','delete']),target:z.uuid().optional(),items:z.array(z.object({id:z.uuid(),revision:z.number().int().positive()})).min(1).max(500)}).strict()),{context,space,project}=await spaceAssetContext(event,body.mode!=='copy')
 const rows=await context.client.from('project_space_objects').select('*').eq('space_id',space)
 if(rows.error)throw createError({statusCode:503,message:'Не удалось прочитать объекты'})
 const selected=new Set(body.items.map(i=>i.id)),source=rows.data.filter(r=>selected.has(r.id)||r.data.kind==='link'&&selected.has(r.data.from)&&selected.has(r.data.to))
 if(body.mode!=='delete'&&source.some(r=>r.data.kind==='link'&&(!selected.has(r.data.from)||!selected.has(r.data.to))))throw createError({statusCode:400,message:'Для переноса связи выберите оба соединённых объекта'})
 if(body.items.some(i=>!source.some(r=>r.id===i.id&&r.revision===i.revision)))throw createError({statusCode:409,message:'Объекты изменились. Обновите выбор'})
 const items=source.map(r=>({id:r.id,revision:r.revision})),mapping=new Map(source.map(r=>[r.id,randomUUID()])),copies:any[]=[],assets:any[]=[],paths:string[]=[],assetMapping=new Map<string,string>()
 if(body.mode!=='delete'){
 const target=await context.client.from('project_spaces').select('project_id').eq('id',body.target||'00000000-0000-4000-8000-000000000000').maybeSingle(),rights=await context.client.rpc('space_permission',{p_actor:context.user.id,p_space:body.target})
 if(target.data?.project_id!==project||!['owner','editor'].includes(rights.data)||body.target===space)throw createError({statusCode:403,message:'Выберите доступное для редактирования пространство проекта'})
 }
 try{if(body.mode!=='delete')for(const row of source){const data={...row.data};if(data.parentId)data.parentId=mapping.get(data.parentId);if(data.from)data.from=mapping.get(data.from)||data.from;if(data.to)data.to=mapping.get(data.to)||data.to
 if(data.assetId){if(!assetMapping.has(data.assetId)){const original=await context.client.from('project_space_assets').select('*').eq('id',data.assetId).eq('space_id',space).single();if(original.error)throw createError({statusCode:404,message:'Вложение недоступно'});const blob=await context.client.storage.from(projectDocumentBucket).download(original.data.path);if(blob.error||!blob.data)throw createError({statusCode:404,message:'Вложение недоступно'});const id=randomUUID(),path=`spaces/${project}/${body.target}/${id}`,bytes=await blob.data.arrayBuffer(),upload=await context.client.storage.from(projectDocumentBucket).upload(path,bytes,{contentType:'application/octet-stream'});if(upload.error)throw upload.error;paths.push(path);assetMapping.set(data.assetId,id);const metadata=openSharedVault(original.data.encrypted_data,sharedSecret(event),`space-asset:${space}:${data.assetId}`,1);assets.push({id,path,encrypted_data:sealSharedVault(metadata,sharedSecret(event),`space-asset:${body.target}:${id}`,1)})}data.assetId=assetMapping.get(data.assetId)}
 copies.push({id:mapping.get(row.id),data})}
 const result=await context.client.rpc('space_group',{p_actor:context.user.id,p_source:space,p_target:body.target||null,p_mode:body.mode,p_items:items,p_copies:copies,p_assets:assets});if(result.error)projectFailure(result.error);return {ids:copies.map(c=>c.id)}
 }catch(error){if(paths.length)await context.client.storage.from(projectDocumentBucket).remove(paths);throw error}
})
