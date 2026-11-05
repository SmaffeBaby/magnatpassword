import { describeDevice } from '../../../../shared/utils/account-device'
import type { AccountDevice } from '../../../../shared/types/account-device'

export default defineEventHandler(async event => {
  const { client, user, sessionId } = await requireSharedUser(event)
  const { data, error } = await client.rpc('account_device_list', { p_actor: user.id })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить устройства.' })
  return (data ?? []).map((row: any): AccountDevice => {
    const fallback = describeDevice(row.userAgent || '')
    return { id: row.id, kind: row.kind === 'app' ? 'app' : 'web', platform: row.platform || fallback.platform,
      browser: row.browser || fallback.browser, createdAt: row.createdAt, lastSeen: row.lastSeen, current: row.id === sessionId }
  })
})
