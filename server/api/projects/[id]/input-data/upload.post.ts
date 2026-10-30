import { randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async event=>{
 const current=await readProjectInputs(event,true)
 const parts=await readMultipartFormData(event),file=parts?.find(p=>p.name==='file'),cardId=parts?.find(p=>p.name==='cardId')?.data.toString(),revision=Number(parts?.find(p=>p.name==='revision')?.data.toString())
 if(!z.uuid().safeParse(cardId).success||!Number.isInteger(revision))throw createError({statusCode:400,message:'Некорректный запрос'})
 inputRevision(current.state.revision,revision)
 const card=current.state.cards.find(c=>c.id===cardId)
 if(!card)throw createError({statusCode:404,message:'Сначала сохраните карточку'})
 if(!file?.filename||!file.data.length)throw createError({statusCode:400,message:'Выберите непустой файл'})
 if(file.data.length>20*1024*1024)throw createError({statusCode:413,message:'Файл должен быть не больше 20 МБ'})
 if(card.attachments.length>=50)throw createError({statusCode:400,message:'В одной карточке можно сохранить до 50 файлов'})
 const id=randomUUID(),path=`${current.id}/${card.id}/${id}`,name=file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,240),now=new Date().toISOString()
 const {error}=await current.context.client.storage.from(inputBucket).upload(path,file.data,{contentType:'application/octet-stream',upsert:false})
 if(error)throw createError({statusCode:503,message:'Не удалось загрузить файл в хранилище'})
 const attachment={id,path,name,type:file.type??'application/octet-stream',size:file.data.length,createdAt:now}
 try{return await saveProjectInputs(event,current,revision,current.state.cards.map(c=>c.id===card.id?{...c,updatedAt:now,attachments:[...c.attachments,attachment]}:c))}
 catch(error){await current.context.client.storage.from(inputBucket).remove([path]);throw error}
})
