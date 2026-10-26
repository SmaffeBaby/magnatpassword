import { requireVaultManager } from '../../../utils/team'
import {categoryIdsSchema} from '../../../utils/shared-vaults'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)

  const body = await sharedBody(event, z.object({ revision: revisionSchema, email:z.email().max(254).optional(),userId:z.uuid().optional(),role:z.enum(['viewer','member','manager']).default('member'), categoryIds:categoryIdsSchema.optional() }).strict())
  await requireVaultManager(context,undefined,body.role)
  if(!body.email&&!body.userId)throw createError({statusCode:400,message:'Выберите участника'})
  let email=body.email
  if(body.userId){const {data}=await context.client.from('team_profiles').select('account_email').eq('user_id',body.userId).single();if(!data)throw createError({statusCode:404,message:'Участник не найден'});email=data.account_email}
  const categoryIds=body.role==='manager'?null:body.categoryIds??null
  if(categoryIds?.some(id=>!decodeShared(event,context.row).categories.some(category=>category.id===id)))throw createError({statusCode:400,message:'Выберите существующие категории'})
  return mutateShared(context, 'invite', context.id, body.revision, { email, role:body.role, categoryIds })
})
