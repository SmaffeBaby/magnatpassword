import {categoryIdsSchema} from '../../../utils/shared-vaults'
import {z} from 'zod'
export default defineEventHandler(async event=>{
  const context=await requireSharedMember(event)
  if(context.row.owner_id!==context.user.id)throw createError({statusCode:403,message:'Права участников меняет владелец хранилища'})
  const body=await sharedBody(event,z.object({revision:revisionSchema,userId:z.uuid(),categoryIds:categoryIdsSchema}).strict())
  if(body.userId===context.row.owner_id)throw createError({statusCode:400,message:'Владелец всегда имеет доступ ко всем категориям'})
  const categories=decodeShared(event,context.row).categories
  if(body.categoryIds?.some(id=>!categories.some(category=>category.id===id)))throw createError({statusCode:400,message:'Выберите существующие категории'})
  return mutateShared(context,'permissions',context.id,body.revision,{userId:body.userId,categoryIds:body.categoryIds===null?null:[...new Set(body.categoryIds)]})
})
