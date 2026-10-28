export default defineEventHandler(async event => {
  const context = await requireSiteAdmin(event)
  const { data, error } = await context.client.from('project_access').select('user_id,granted_at,team_profiles!inner(full_name,account_email)').order('granted_at').limit(1000)
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить доступы к проектам' })
  return (data ?? []).map((row: any) => ({ id: row.user_id, fullName: row.team_profiles.full_name, email: row.team_profiles.account_email, grantedAt: row.granted_at }))
})
