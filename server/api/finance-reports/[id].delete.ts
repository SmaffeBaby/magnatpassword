import { z } from 'zod'
export default defineEventHandler(async event=>{
  const context=await requireSharedUser(event),id=z.uuid().safeParse(getRouterParam(event,'id'))
  if(!id.success)throw createError({statusCode:400,message:'Некорректный отчёт'})
  const {data,error}=await context.client.from('finance_reports').delete().eq('user_id',context.user.id).eq('id',id.data).select('id')
  if(error)throw createError({statusCode:503,message:'Не удалось удалить отчёт'})
  if(!data.length)throw createError({statusCode:404,message:'Отчёт не найден'})
  return {ok:true}
})
