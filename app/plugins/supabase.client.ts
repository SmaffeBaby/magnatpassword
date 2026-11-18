import { createClient } from '@supabase/supabase-js'
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const supabase = createClient(new URL(backendUrl(config.public.supabaseUrl), window.location.origin).href, config.public.supabaseAnonKey, {
    // The same-origin WebSocket relay transports text frames. Protocol 1 keeps
    // broadcasts in JSON rather than converting binary frames into text.
    realtime: { vsn: '1.0.0' }
  })
  return { provide: { supabase } }
})
