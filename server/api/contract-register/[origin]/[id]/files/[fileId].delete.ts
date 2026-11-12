import { registryFiles,registryId,registryBucket,registryFailure } from '../../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 const current=await registryFiles(event,true),id=registryId(event,'fileId')
 if(!current.files.some(f=>f.id===id))throw createError({statusCode:404,message:'Файл не найден.'})
 const {data,error}=await current.context.client.rpc('registry_contract_files_access',{p_actor:current.context.user.id,p_origin:'standalone',p_contract:current.id,p_write:true,p_file:id,p_delete:true})
 if(error)registryFailure(error)
 await current.context.client.storage.from(registryBucket).remove([`${current.id}/${id}`])
 return {revision:data.revision}
})
