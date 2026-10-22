import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, data: sharedDataSchema }).strict())
  const { data, error } = await context.client.from('vaults').update({ encrypted_data: sealPersonal(event, body.data, context.user.id), revision: body.revision + 1, updated_at: new Date().toISOString() }).eq('user_id', context.user.id).eq('encryption_mode', 'server').eq('revision', body.revision).select('revision').maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Personal vault unavailable', message: 'Не удалось сохранить личное хранилище' })
  if (!data) throw createError({ statusCode: 409, statusMessage: 'Revision conflict', message: 'Хранилище изменилось. Обновите страницу и повторите изменение.' })
  return { revision: data.revision }
})
