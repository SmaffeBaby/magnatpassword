import {z} from 'zod'
export default defineEventHandler(async event=>{
 const {context,space}=await spaceAssetContext(event),id=z.uuid().parse(getRouterParam(event,'fileId')),result=await context.client.from('project_space_assets').select('path').eq('id',id).eq('space_id',space).maybeSingle()
 if(result.error||!result.data)throw createError({statusCode:404,message:'Файл недоступен'})
 const blob=await context.client.storage.from(projectDocumentBucket).download(result.data.path)
 if(blob.error||!blob.data)throw createError({statusCode:404,message:'Файл недоступен'})
 setHeader(event,'Content-Type','application/octet-stream');setHeader(event,'X-Content-Type-Options','nosniff')
 return Buffer.from(await blob.data.arrayBuffer())
})
