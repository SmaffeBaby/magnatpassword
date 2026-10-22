import type { H3Event } from 'h3'

export async function requireSiteAdmin(event: H3Event) {
  const authorization = getHeader(event, 'authorization')
  const match = authorization?.match(/^Bearer (\S+)$/i)
  if (!match) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const client = serverSupabase(event)
  const { data, error } = await client.auth.getUser(match[1])
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Invalid session' })
  const { data: admin, error: accessError } = await client.from('site_admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
  if (accessError) throw createError({ statusCode: 503, statusMessage: 'Unable to verify access' })
  if (!admin) throw createError({ statusCode: 403, statusMessage: 'Administrator access required' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return { client, user: data.user }
}
