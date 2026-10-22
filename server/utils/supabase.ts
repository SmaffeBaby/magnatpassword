import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export function serverSupabase(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.supabaseServiceRoleKey) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase is not configured' })
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
