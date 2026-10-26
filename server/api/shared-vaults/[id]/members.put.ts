import { requireVaultManager } from '../../../utils/team'
import {categoryIdsSchema} from '../../../utils/shared-vaults'
import {z} from 'zod'
export default defineEventHandler(async event=>{
  const context=await requireSharedMember(event)
  const body=await sharedBody(event,z.object({revision:revisionSchema,userId:z.uuid(),role:z.enum(['viewer','member','manager']).default('member'),categoryIds:categoryIdsSchema}).strict())
  await requireVaultManager(context,body.userId,body.role)
  if(body.userId===context.row.owner_id)throw createError({statusCode:400,message:'Владелец всегда имеет доступ ко всем категориям'})
  const categories=decodeShared(event,context.row).categories
  if(body.categoryIds?.some(id=>!categories.some(category=>category.id===id)))throw createError({statusCode:400,message:'Выберите существующие категории'})
  return mutateShared(context,'permissions',context.id,body.revision,{userId:body.userId,role:body.role,categoryIds:body.role==='manager'||body.categoryIds===null?null:[...new Set(body.categoryIds)]})
})
