import { z } from 'zod'
export default defineEventHandler(async event=>{
  const context=await requireSharedUser(event)
  const parsed=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).safeParse(getQuery(event))
  if(!parsed.success)throw createError({statusCode:400,message:'Некорректная страница истории отчётов'})
  const offset=(parsed.data.page-1)*20
  const {data,error,count}=await context.client.from('finance_reports').select('id,encrypted_summary',{count:'exact'}).eq('user_id',context.user.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19)
  if(error)throw createError({statusCode:503,message:'Не удалось загрузить историю отчётов'})
  return {items:data.map(row=>decodeReportSummary(event,context.user.id,row)),total:count??0}
})
