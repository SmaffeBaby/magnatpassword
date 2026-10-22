export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    await $fetch(`${config.supabaseUrl}/rest/v1/`, {
      headers: { apikey: config.supabaseServiceRoleKey }, timeout: 5000
    })
    return { ok: true, service: 'magnat-password', database: 'reachable' }
  } catch {
    setResponseStatus(event, 503)
    return { ok: false, service: 'magnat-password', database: 'unavailable' }
  }
})
