import type { RealtimeChannel } from '@supabase/supabase-js'
import { RefreshQueue } from '~~/shared/utils/refresh-queue'
export default defineNuxtPlugin({ name: 'chat-notifications', enforce: 'post', setup(nuxtApp) {
  const auth = useAuthStore(), store = useNotificationsStore(), hub = useChatHubStore(), client = nuxtApp.$supabase
  let channel: RealtimeChannel | null = null, epoch = 0, stopped = false
  const queue = new RefreshQueue(async () => { await Promise.all([store.refresh(true), hub.refresh(true)]) }, () => !auth.user || document.visibilityState !== 'visible', undefined, 2000)
  const resume = () => { if (auth.user && document.visibilityState === 'visible') queue.request() }
  const stop = watch(() => auth.user?.id, async id => {
    const attempt = ++epoch
    const old = channel; channel = null
    if (old) await client.removeChannel(old)
    if (!id || stopped || attempt !== epoch) return
    const { data } = await client.auth.getSession()
    if (attempt !== epoch || data.session?.user.id !== id || stopped) return
    await client.realtime.setAuth(data.session.access_token)
    if (attempt !== epoch || stopped) return
    channel = client.channel(`chat-notifications-${id}-${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_chat_live', filter: `user_id=eq.${id}` }, () => { if (attempt === epoch) queue.request() })
      .subscribe(status => { if (status === 'SUBSCRIBED' && attempt === epoch) queue.request() })
    queue.request()
  }, { immediate: true })
  document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume)
  const timer = setInterval(resume, 60000)
  nuxtApp.vueApp.onUnmount(() => { stopped = true; epoch++; stop(); queue.stop(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); if (channel) void client.removeChannel(channel) })
} })
