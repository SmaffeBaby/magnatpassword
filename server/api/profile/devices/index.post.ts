import { z } from 'zod'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { client, user, sessionId } = context
  const body = await sharedBody(event, z.object({ kind: z.enum(['web', 'app']), platform: z.string().trim().min(1).max(80), browser: z.string().trim().min(1).max(80) }).strict())
  const { data, error } = await client.rpc('account_device_touch', { p_actor: user.id, p_session: sessionId, p_kind: body.kind, p_platform: body.platform, p_browser: body.browser })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось обновить устройство.' })
  if (!data) throw createError({ statusCode: 401, message: 'Сессия устройства завершена.' })
  return { ok: true, accessSettings: await readAccountAccessSettings(context) }
})
