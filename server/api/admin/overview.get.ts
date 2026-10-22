export default defineEventHandler(async event => {
  const { client } = await requireSiteAdmin(event)
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw createError({ statusCode: 503, statusMessage: 'Unable to load users' })
  const { count, error: countError } = await client.from('vaults').select('user_id', { count: 'exact', head: true })
  if (countError) throw createError({ statusCode: 503, statusMessage: 'Unable to count vaults' })
  return { vaults: count ?? 0, totalUsers: data.total, users: data.users.map(user => ({ id: user.id, email: user.email, createdAt: user.created_at, lastSignIn: user.last_sign_in_at })) }
})
