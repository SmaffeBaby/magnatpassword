import { z } from 'zod'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ rememberPassword: z.boolean(), logoutMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60), z.literal(120)]), onlyIfMissing: z.boolean().optional() }).strict())
  const { error } = await context.client.from('account_access_settings').upsert({ user_id: context.user.id, remember_password: body.rememberPassword, logout_minutes: body.logoutMinutes, updated_at: new Date().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: body.onlyIfMissing === true })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось сохранить настройки входа.' })
  return readAccountAccessSettings(context)
})
