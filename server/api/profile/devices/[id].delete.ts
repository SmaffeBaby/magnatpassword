import { z } from 'zod'

export default defineEventHandler(async event => {
  const { client, user, sessionId } = await requireSharedUser(event)
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректное устройство.' })
  const { data, error } = await client.rpc('account_device_revoke', { p_actor: user.id, p_session: id.data })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось завершить сеанс устройства.' })
  if (!data) throw createError({ statusCode: 404, message: 'Устройство не найдено.' })
  return { ok: true, current: id.data === sessionId }
})
