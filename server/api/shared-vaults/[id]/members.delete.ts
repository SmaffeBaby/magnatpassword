import { requireVaultManager } from '../../../utils/team'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)

  const body = await sharedBody(event, z.object({ revision: revisionSchema, userId: z.uuid() }).strict())
  await requireVaultManager(context,body.userId)
  const encryptedData = sealSharedVault(decodeShared(event, context.row), sharedSecret(event), context.id, context.row.key_epoch + 1)
  return mutateShared(context, 'revoke', context.id, body.revision, { userId: body.userId, encryptedData })
})
