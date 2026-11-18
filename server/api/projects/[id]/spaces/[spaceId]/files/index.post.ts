import {randomUUID} from 'node:crypto'
export default defineEventHandler(async event=>{
 const {context,project,space}=await spaceAssetContext(event,true),parts=await readMultipartFormData(event),file=parts?.find(p=>p.name==='file')
 if(!file?.filename||!file.data.length||file.data.length>20*1024*1024)throw createError({statusCode:400,message:'Выберите непустой файл до 20 МБ'})
 const id=randomUUID(),path=`spaces/${project}/${space}/${id}`,metadata={name:file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,240),size:file.data.length,type:file.type||'application/octet-stream',description:'',tags:[]}
 const upload=await context.client.storage.from(projectDocumentBucket).upload(path,file.data,{contentType:'application/octet-stream'})
 if(upload.error)throw createError({statusCode:503,message:'Не удалось загрузить файл'})
 const result=await context.client.from('project_space_assets').insert({id,space_id:space,path,created_by:context.user.id,encrypted_data:sealSharedVault(metadata,sharedSecret(event),`space-asset:${space}:${id}`,1)})
 if(result.error){await context.client.storage.from(projectDocumentBucket).remove([path]);throw createError({statusCode:503,message:'Не удалось сохранить файл'})}
 return {id}
})
