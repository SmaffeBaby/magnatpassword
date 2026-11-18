import {z} from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),query=z.object({q:z.string().trim().max(120).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}).safeParse(getQuery(event))
 if(!query.success)throw createError({statusCode:400,message:'Некорректный запрос поиска сотрудников'})
 const [directory,units]=await Promise.all([teamDirectory(context,query.data.q,query.data.page),teamUnits(context)])
 return {...directory,units}
})
