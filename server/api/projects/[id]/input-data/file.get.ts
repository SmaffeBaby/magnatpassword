import { z } from 'zod'
export default defineEventHandler(async event=>{
 const current=await readProjectInputs(event),query=getQuery(event),id=z.uuid().safeParse(query.file)
 if(!id.success)throw createError({statusCode:400,message:'Некорректный файл'})
 const file=current.state.cards.flatMap(c=>c.attachments).find(a=>a.id===id.data)
 if(!file)throw createError({statusCode:404,message:'Файл не найден'})
 const {data,error}=await current.context.client.storage.from(inputBucket).download(file.path)
 if(error||!data)throw createError({statusCode:404,message:'Файл недоступен'})
 setHeader(event,'Cache-Control','private, no-store');setHeader(event,'X-Content-Type-Options','nosniff')
 setHeader(event,'Content-Type','application/octet-stream')
 setHeader(event,'Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
 return Buffer.from(await data.arrayBuffer())
})
