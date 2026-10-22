import { createClient } from '@supabase/supabase-js'
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const supabase = createClient(new URL(config.public.supabaseUrl, window.location.origin).href, config.public.supabaseAnonKey)
  return { provide: { supabase } }
})
