import { z } from 'zod'
import { registryFiles,registryBucket,registryFailure } from '../../../../../utils/contract-register'
import { sealSharedVault } from '../../../../../utils/shared-crypto'
export default defineEventHandler(async event=>{
 const current=await registryFiles(event,true)
 const parts=await readMultipartFormData(event),file=parts?.find(p=>p.name==='file'),id=z.uuid().safeParse(parts?.find(p=>p.name==='fileId')?.data.toString())
 if(!id.success||!file?.filename||!file.data.length)throw createError({statusCode:400,message:'Выберите непустой файл.'})
 if(file.data.length>20*1024*1024)throw createError({statusCode:413,message:'Файл должен быть не больше 20 МБ.'})
 const kind=z.enum(['contract','supplement']).default('contract').safeParse(parts?.find(p=>p.name==='kind')?.data.toString())
 if(!kind.success)throw createError({statusCode:400,message:'Некорректная группа файлов.'})
 const existing=current.files.find(f=>f.id===id.data)
 if(existing&&(existing.kind||'contract')!==kind.data)throw createError({statusCode:409,message:'Этот файл уже загружен в другую группу.'})
 if(existing)return {file:existing,revision:current.revision}
 if(current.files.length>=20)throw createError({statusCode:400,message:'К договору можно прикрепить до 20 файлов.'})
 const path=`${current.id}/${id.data}`,metadata={kind:kind.data,id:id.data,name:file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,240),size:file.data.length,type:(file.type||'application/octet-stream').slice(0,120),createdAt:new Date().toISOString()}
 const upload=await current.context.client.storage.from(registryBucket).upload(path,file.data,{upsert:false,contentType:'application/octet-stream'})
 if(upload.error)throw createError({statusCode:503,message:'Не удалось загрузить файл договора.'})
 try{
  const result=await current.context.client.rpc('registry_contract_files_access',{p_actor:current.context.user.id,p_origin:'standalone',p_contract:current.id,p_write:true,p_file:id.data,p_data:sealSharedVault(metadata,sharedSecret(event),`registry-file:${current.id}:${id.data}`,1)})
  if(result.error)registryFailure(result.error)
  return {file:metadata,revision:result.data.revision}
 }catch(error){await current.context.client.storage.from(registryBucket).remove([path]);throw error}
})
