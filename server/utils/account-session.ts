import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// Call only after getUser(token) has verified the bearer token.
export function verifiedSessionId(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'))
    return z.uuid().parse(payload.session_id)
  } catch { throw createError({ statusCode: 401, message: 'Сессия завершена. Войдите снова.' }) }
}
export async function assertActiveAccountSession(client: SupabaseClient, userId: string, token: string) {
  const sessionId = verifiedSessionId(token)
  const { data, error } = await client.rpc('account_session_active', { p_actor: userId, p_session: sessionId })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить сессию устройства.' })
  if (!data) throw createError({ statusCode: 401, message: 'Доступ с этого устройства завершён. Войдите снова.' })
  return sessionId
}
