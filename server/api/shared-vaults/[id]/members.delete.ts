import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  if (context.row.owner_id !== context.user.id) throw createError({ statusCode: 403, statusMessage: 'Shared vault request failed', message: 'Доступ отзывает владелец хранилища' })
  const body = await sharedBody(event, z.object({ revision: revisionSchema, userId: z.uuid() }).strict())
  const encryptedData = sealSharedVault(decodeShared(event, context.row), sharedSecret(event), context.id, context.row.key_epoch + 1)
  return mutateShared(context, 'revoke', context.id, body.revision, { userId: body.userId, encryptedData })
})
