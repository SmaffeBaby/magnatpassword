import { randomUUID } from 'node:crypto'
import { sealSharedVault } from '../../utils/shared-crypto'

const generating = new Set<string>()
export default defineEventHandler(async event => {
  const context=await requireSharedUser(event)
  const request=await sharedBody(event,financeReportRequestSchema)
  if(generating.has(context.user.id))throw createError({statusCode:409,message:'Отчёт уже формируется. Дождитесь завершения.'})
  generating.add(context.user.id)
  try{
    const sources=await reportSources(event,context,request.vaultIds)
    const id=randomUUID(),createdAt=new Date().toISOString(),snapshot=reportSnapshot(request,sources,id,createdAt)
    const pdf=await renderFinanceReport(snapshot)
    const {error}=await context.client.from('finance_reports').insert({id,user_id:context.user.id,created_at:createdAt,encrypted_summary:sealSharedVault(snapshot.summary,sharedSecret(event),reportContext(context.user.id,id,'summary'),1),encrypted_pdf:sealSharedVault({pdf:pdf.toString('base64')},sharedSecret(event),reportContext(context.user.id,id,'pdf'),1)})
    if(error)throw createError({statusCode:503,message:'Не удалось сохранить отчёт. Повторите попытку.'})
    return snapshot.summary
  }finally{generating.delete(context.user.id)}
})
