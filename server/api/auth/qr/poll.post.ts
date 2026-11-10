export default defineEventHandler(async event => {
  qrLimit(event, 'poll')
  const { id, secret } = await sharedBody(event, qrBrowserSchema)
  const { data, error } = await serverSupabase(event).from('qr_login_requests').select('state,expires_at')
    .eq('id', id).eq('browser_hash', qrHash(secret)).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить подтверждение.' })
  if (!data || Date.parse(data.expires_at) <= Date.now()) qrUnavailable()
  return { state: data.state }
})
