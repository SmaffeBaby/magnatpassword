export default defineEventHandler(async event => {
  qrLimit(event, 'poll')
  const { id, secret } = await sharedBody(event, qrBrowserSchema)
  const client = serverSupabase(event)
  // Atomic transition: only the requesting browser can claim this approval, once.
  const { data, error } = await client.from('qr_login_requests').update({ state: 'consumed' })
    .eq('id', id).eq('browser_hash', qrHash(secret)).eq('state', 'approved')
    .gt('expires_at', new Date().toISOString()).select('approved_user_id').maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось завершить вход.' })
  if (!data?.approved_user_id) qrUnavailable()
  const { data: account, error: userError } = await client.auth.admin.getUserById(data.approved_user_id)
  if (userError || !account.user?.email) qrUnavailable()
  // Mint an independent session; never copy the phone's access/refresh tokens.
  const { data: link, error: linkError } = await client.auth.admin.generateLink({ type: 'magiclink', email: account.user.email })
  if (linkError || !link.properties?.hashed_token || link.user?.id !== data.approved_user_id) throw createError({ statusCode: 503, message: 'Не удалось создать сессию. Обновите QR-код.' })
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token })
  if (verifyError || !verified.session || verified.user?.id !== data.approved_user_id) throw createError({ statusCode: 503, message: 'Не удалось создать сессию. Обновите QR-код.' })
  return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token }
})
