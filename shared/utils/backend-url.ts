// Only backend paths are remote. Pages, scripts and other app assets stay local.
export function resolveBackendUrl(path: string, origin: string): string {
  if (!origin || !/^\/(?:api|supabase)(?:\/|\?|$)/.test(path)) return path
  return new URL(path, origin).href
}
