import { z } from 'zod'
export default defineEventHandler(async event => {
  qrLimit(event, 'scan')
  const { client, user } = await requireSharedUser(event)
  const { token, approve } = await sharedBody(event, qrScanSchema.extend({ approve: z.boolean() }))
  const { data, error } = await client.from('qr_login_requests')
    .update({ state: approve ? 'approved' : 'rejected', approved_user_id: approve ? user.id : null })
    .eq('scan_hash', qrHash(token)).eq('state', 'pending').gt('expires_at', new Date().toISOString()).select('id').maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось подтвердить вход.' })
  if (!data) qrUnavailable()
  return { ok: true }
})
