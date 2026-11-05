export default defineEventHandler(event => {
  setHeader(event, 'Cache-Control', 'no-store')
  return { version: useRuntimeConfig(event).public.webBuildId }
})
