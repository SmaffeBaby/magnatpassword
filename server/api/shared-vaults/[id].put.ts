import {mergeCategoryScopedData} from '../../utils/category-access'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  if(context.membership.member_role==='viewer')throw createError({statusCode:403,message:'Наблюдатель не может изменять карточки'})
  const body = await sharedBody(event, z.object({ revision: revisionSchema, data: sharedDataSchema }).strict())
  const next = mergeCategoryScopedData(decodeShared(event,context.row),body.data,context.membership.category_ids)
  const encryptedData = sealSharedVault(next, sharedSecret(event), context.id, context.row.key_epoch)
  return mutateShared(context, 'save', context.id, body.revision, { encryptedData, accessToken:context.membership.access_token })
})
