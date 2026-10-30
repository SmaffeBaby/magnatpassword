import { inputDeleteSchema } from '../../../../../shared/utils/project-inputs'
export default defineEventHandler(async event=>{
 const current=await readProjectInputs(event,true),body=await sharedBody(event,inputDeleteSchema)
 inputRevision(current.state.revision,body.revision)
 const card=current.state.cards.find(c=>c.id===body.id)
 if(!card)throw createError({statusCode:404,message:'Карточка не найдена'})
 const removed=card.attachments.filter(a=>!body.attachmentId||a.id===body.attachmentId)
 const cards=body.attachmentId?current.state.cards.map(c=>c.id===card.id?{...c,updatedAt:new Date().toISOString(),attachments:c.attachments.filter(a=>a.id!==body.attachmentId)}:c):current.state.cards.filter(c=>c.id!==card.id)
 const result=await saveProjectInputs(event,current,body.revision,cards)
 if(removed.length){const {error}=await current.context.client.storage.from(inputBucket).remove(removed.map(a=>a.path));if(error)console.error('Project input attachment cleanup failed',error.message)}
 return result
})
