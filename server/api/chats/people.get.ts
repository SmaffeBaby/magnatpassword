import {z} from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),query=z.object({q:z.string().trim().min(2).max(120),page:z.coerce.number().int().min(1).max(10000).default(1)}).safeParse(getQuery(event))
 if(!query.success)throw createError({statusCode:400,message:'Введите минимум два символа для поиска'})
 return teamDirectory(context,query.data.q,query.data.page)
})
