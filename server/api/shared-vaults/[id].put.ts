import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, data: sharedDataSchema }).strict())
  const encryptedData = sealSharedVault(body.data, sharedSecret(event), context.id, context.row.key_epoch)
  return mutateShared(context, 'save', context.id, body.revision, { encryptedData })
})
