export default defineEventHandler(async event => {
  qrLimit(event, 'scan')
  const { token } = await sharedBody(event, qrScanSchema)
  const { data, error } = await serverSupabase(event).from('qr_login_requests')
    .select('verification_code,device_label,expires_at,state').eq('scan_hash', qrHash(token)).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить QR-код.' })
  if (!data || data.state !== 'pending') qrUnavailable()
  return { code: data.verification_code, device: data.device_label, expiresAt: data.expires_at }
})
