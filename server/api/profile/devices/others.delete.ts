export default defineEventHandler(async event => {
  const { client, user, sessionId } = await requireSharedUser(event)
  const { data, error } = await client.rpc('account_device_revoke_others', {
    p_actor: user.id,
    p_current_session: sessionId
  })

  if (error) throw createError({ statusCode: 503, message: 'Не удалось выйти с других устройств.' })
  if (data === null) throw createError({ statusCode: 401, message: 'Сессия устройства завершена.' })
  return { revoked: data as number }
})
