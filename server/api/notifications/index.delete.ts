import { z } from 'zod'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.union([
    z.object({ all: z.literal(true) }).strict(),
    z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict()
  ]))
  let query = context.client.from('app_notifications').update({
    dismissed_at: new Date().toISOString(), title: '', message: '', vault_id: null, entry_id: null, field_id: null
  }).eq('user_id', context.user.id).is('dismissed_at', null)
  if ('ids' in body) query = query.in('id', body.ids)
  const { error } = await query
  if (error) throw createError({ statusCode: 503, message: 'Не удалось очистить уведомления' })
  return { ok: true }
})
