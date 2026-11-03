// Native clients use a bundled frontend. Authentication and all access checks
// remain in the existing API handlers; CORS does not grant data access.
export default defineEventHandler(event => {
  if (!/^\/(?:api|supabase)(?:\/|$)/.test(getRequestURL(event).pathname)) return
  const origin = getHeader(event, 'origin')
  if (!origin || !['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:3004'].includes(origin)) return
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range',
    'Access-Control-Expose-Headers': 'content-disposition, content-range',
    'Vary': 'Origin'
  })
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
