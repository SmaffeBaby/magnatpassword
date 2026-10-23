import { z } from 'zod'
import { openSharedVault } from '../../utils/shared-crypto'
export default defineEventHandler(async event=>{
  const context=await requireSharedUser(event),id=z.uuid().safeParse(getRouterParam(event,'id'))
  if(!id.success)throw createError({statusCode:400,message:'Некорректный отчёт'})
  const {data,error}=await context.client.from('finance_reports').select('id,encrypted_summary,encrypted_pdf').eq('user_id',context.user.id).eq('id',id.data).maybeSingle()
  if(error)throw createError({statusCode:503,message:'Не удалось загрузить отчёт'})
  if(!data)throw createError({statusCode:404,message:'Отчёт не найден'})
  const summary=decodeReportSummary(event,context.user.id,data)
  const payload=openSharedVault<{pdf:string}>(data.encrypted_pdf,sharedSecret(event),reportContext(context.user.id,id.data,'pdf'),1)
  const pdf=Buffer.from(payload.pdf,'base64')
  setHeader(event,'Content-Type','application/pdf')
  setHeader(event,'Content-Disposition',`attachment; filename="${summary.filename}"`)
  setHeader(event,'Content-Length',pdf.length)
  return pdf
})
