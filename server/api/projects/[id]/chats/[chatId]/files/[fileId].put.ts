import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import {documentMaxSize,documentMetadataSchema} from '~~/shared/utils/project-documents'
export default defineEventHandler(async event=>{
 const {context,project,chat}=await projectChatContext(event),id=chatFileId(event)
 const row=await chatRpc(context,'project_chat_file_read',{p_project:project,p_chat:chat,p_file:id})
 if(row.createdBy!==context.user.id)throw createError({statusCode:403,message:'Изменять вложение может только добавивший его пользователь'})
 const parts=await readMultipartFormData(event),file=parts?.find(part=>part.name==='file'),revision=z.coerce.number().int().positive().safeParse(parts?.find(part=>part.name==='revision')?.data.toString())
 if(!file?.filename||!file.data.length||!revision.success)throw createError({statusCode:400,message:'Укажите файл и его версию'})
 if(file.data.length>documentMaxSize)throw createError({statusCode:413,message:'Файл должен быть не больше 20 МБ'})
 const previous=decodeChatFile(event,project,chat,row,context.user.id),parsed=documentMetadataSchema.safeParse({name:file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,240),description:previous.description,tags:previous.tags})
 if(!parsed.success)throw createError({statusCode:400,message:'Некорректное имя файла'})
 const metadata={...parsed.data,size:file.data.length,type:(!file.type||file.type==='application/octet-stream'?previous.type:file.type).slice(0,255)},path=`chat/${project}/${chat}/${id}/${randomUUID()}`
 const upload=await context.client.storage.from(projectDocumentBucket).upload(path,file.data,{contentType:'application/octet-stream',upsert:false})
 if(upload.error)throw createError({statusCode:503,message:'Не удалось сохранить файл'})
 try{await chatRpc(context,'chat_file_replace',{p_project:project,p_chat:chat,p_file:id,p_revision:revision.data,p_path:path,p_data:sealSharedVault(metadata,sharedSecret(event),`project-chat-file:${project}:${chat}:${id}`,1)})}
 catch(error){await discardProjectDocumentObjects(context,[path]);throw error}
 await cleanupProjectDocuments(context).catch(()=>{})
 return {...metadata,id,documentId:row.documentId,revision:revision.data+1,canEdit:true}
})
