export default defineEventHandler(async event => {
  qrLimit(event, 'create')
  const configuredOrigin = process.env.MAGNAT_SERVER_URL
  let origin: string | undefined
  if (configuredOrigin) {
    try {
      const url = new URL(configuredOrigin)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin')
      origin = url.origin
    } catch { throw createError({ statusCode: 503, message: 'Не настроен адрес сервера для QR-входа.' }) }
  }
  const client = serverSupabase(event)
  // Bound the table without keeping expired challenges or account history.
  const { error: cleanupError } = await client.from('qr_login_requests').delete().lt('expires_at', new Date().toISOString())
  if (cleanupError) throw createError({ statusCode: 503, message: 'Вход по QR временно недоступен.' })
  const { row, token, secret } = newQrRequest(getHeader(event, 'user-agent') || '')
  const { error } = await client.from('qr_login_requests').insert(row)
  if (error) throw createError({ statusCode: 503, message: 'Не удалось создать QR-код.' })
  return { id: row.id, token, secret, code: row.verification_code, expiresAt: row.expires_at, origin }
})
