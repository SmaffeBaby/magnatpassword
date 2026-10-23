import {mergeCategoryScopedData} from '../../utils/category-access'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, data: sharedDataSchema }).strict())
  const next = mergeCategoryScopedData(decodeShared(event,context.row),body.data,context.membership.category_ids)
  const encryptedData = sealSharedVault(next, sharedSecret(event), context.id, context.row.key_epoch)
  return mutateShared(context, 'save', context.id, body.revision, { encryptedData, accessToken:context.membership.access_token })
})
