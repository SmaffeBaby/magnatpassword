// Keep browser requests on the site's origin so LAN clients never use their own localhost.
// The gateway still validates the caller's API key/JWT and PostgreSQL RLS applies.
export default defineEventHandler((event) => {
  const request = getRequestURL(event)
  const path = request.pathname.slice('/supabase'.length)
  if (!/^\/(auth|rest|storage|functions|graphql)\/v1(?:\/|$)/.test(path)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const config = useRuntimeConfig(event)
  const target = new URL(path + request.search, config.supabaseUrl)
  return proxyRequest(event, target.href)
})
