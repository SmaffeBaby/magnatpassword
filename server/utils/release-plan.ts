import type { H3Event } from 'h3'
export async function readReleasePlan(event: H3Event) {
  const { data, error } = await serverSupabase(event).from('app_release_plan').select('version,notes,updated_at').eq('id', true).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить настройки релиза' })
  return data ? { version: data.version as string, notes: data.notes as string, updatedAt: data.updated_at as string } : null
}
