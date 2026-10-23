import {categoryIdsSchema} from '../../../utils/shared-vaults'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  if (context.row.owner_id !== context.user.id) throw createError({ statusCode: 403, statusMessage: 'Shared vault request failed', message: 'Участников добавляет владелец хранилища' })
  const body = await sharedBody(event, z.object({ revision: revisionSchema, email: z.email().max(254), categoryIds:categoryIdsSchema.optional() }).strict())
  const categoryIds=body.categoryIds??null
  if(categoryIds?.some(id=>!decodeShared(event,context.row).categories.some(category=>category.id===id)))throw createError({statusCode:400,message:'Выберите существующие категории'})
  return mutateShared(context, 'invite', context.id, body.revision, { email: body.email, categoryIds })
})
