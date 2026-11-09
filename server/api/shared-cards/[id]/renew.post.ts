import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import {nextPaidUntil,subscriptionRows} from '../../../../shared/utils/subscriptions'
import {paymentForRenewal} from '../../../../shared/utils/subscription-finances'
export default defineEventHandler(async event=>{
 const context=await requireCard(event),body=await sharedBody(event,z.object({revision:revisionSchema,fieldId:z.uuid(),payment:paymentSchema.optional()}).strict())
 const entry=structuredClone(context.card.entry),sub=(entry.financeSubscription?.id===body.fieldId?entry.financeSubscription:entry.customFields?.find(field=>field.id===body.fieldId))?.subscription
 if(!sub)throw createError({statusCode:404,message:'Подписка не найдена'})
 const until=body.payment?.periodUntil??nextPaidUntil(sub)
 if(!until)throw createError({statusCode:400,message:'Не удалось рассчитать срок подписки'})
 const row=subscriptionRows([{...entry,vaultId:context.card.vaultIds[0]??'personal',vaultName:''}]).find(row=>row.field.id===body.fieldId)!
 const payment=body.payment??paymentForRenewal(row,until,randomUUID())
 if(payment.entryId!==entry.id||payment.fieldId!==body.fieldId||payment.periodFrom!==sub.paidUntil||payment.periodUntil<=sub.paidUntil)throw createError({statusCode:400,message:'Проверьте оплаченный период. Продление должно начинаться с текущего срока подписки.'})
 if(context.card.payments.some(item=>item.id===payment.id))throw createError({statusCode:409,message:'Эта оплата уже записана. Обновите историю.'})
 const payments=[...context.card.payments,{...payment,service:entry.title,label:row.field.label}]
 if(payments.length>20000)throw createError({statusCode:400,message:'Достигнут предел записей истории'})
 sub.paidFrom=sub.paidUntil;sub.paidUntil=until;entry.updatedAt=new Date().toISOString()
 return mutateCard(context,context.id,body.revision,{encryptedData:sealCard(event,context.id,entry,payments)})
})
