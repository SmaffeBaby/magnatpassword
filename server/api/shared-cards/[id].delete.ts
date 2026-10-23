import {z} from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireCard(event),body=await sharedBody(event,z.object({revision:revisionSchema}).strict())
 const blank={id:context.card.entry.id,title:'Удалённая карточка',url:'',username:'',password:'',notes:'',categoryId:context.card.entry.categoryId,categoryIds:context.card.entry.categoryIds,favorite:false,createdAt:context.card.entry.createdAt,updatedAt:new Date().toISOString()}
 return mutateCard(context,context.id,body.revision,{action:'delete',...(context.card.payments.length?{encryptedData:sealCard(event,context.id,blank,context.card.payments)}:{})})
})
