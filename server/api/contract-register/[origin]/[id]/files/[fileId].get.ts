import { registryFiles,registryId,registryBucket } from '../../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 const current=await registryFiles(event),id=registryId(event,'fileId'),file=current.files.find(f=>f.id===id)
 if(!file)throw createError({statusCode:404,message:'Файл не найден.'})
 const path=file.origin==='project'?`${file.projectId}/${file.contractId}/${id}`:`${file.contractId}/${id}`
 const {data,error}=await current.context.client.storage.from(file.origin==='project'?'project-contracts':registryBucket).download(path)
 if(error||!data)throw createError({statusCode:404,message:'Файл недоступен.'})
 setHeader(event,'Content-Type','application/octet-stream');setHeader(event,'X-Content-Type-Options','nosniff');setHeader(event,'Cache-Control','private, no-store')
 setHeader(event,'Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
 return Buffer.from(await data.arrayBuffer())
})
