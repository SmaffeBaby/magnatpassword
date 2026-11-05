export async function readAccountAccessSettings(context: Awaited<ReturnType<typeof requireSharedUser>>) {
  const { data, error } = await context.client.from('account_access_settings').select('remember_password,logout_minutes').eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить настройки входа.' })
  return { rememberPassword: data?.remember_password ?? false, logoutMinutes: data?.logout_minutes ?? 5, configured: Boolean(data) }
}
