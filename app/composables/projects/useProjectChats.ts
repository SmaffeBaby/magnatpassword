import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/vue-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { RefreshQueue } from '~~/shared/utils/refresh-queue'
import type { ProjectChat, ProjectChatPage } from '~~/shared/types/project-chats'
export function useProjectChats(projectId: MaybeRefOrGetter<string>, chatId: MaybeRefOrGetter<string>, anchor: MaybeRefOrGetter<number | null> = null) {
  const auth = useAuthStore(), client = useQueryClient(), supabase = useNuxtApp().$supabase
  const connected = ref(false), base = computed(() => `/api/projects/${toValue(projectId)}/chats`)
  const key = computed(() => ['account', auth.user?.id, 'project-chats', toValue(projectId)])
  const chats = useQuery({ queryKey: computed(() => [...key.value, 'list']), queryFn: ({ signal }) => sharedRequest<ProjectChat[]>(base.value, { signal }), enabled: computed(() => !!auth.user), retry: false, refetchInterval: computed(() => connected.value ? false : 15000) })
  const messages = useInfiniteQuery({ queryKey: computed(() => [...key.value, toValue(chatId), 'messages', toValue(anchor)]), initialPageParam: null as number | null,
    queryFn: ({ signal, pageParam, queryKey }) => {
      const [, , , project, chat, , sequence] = queryKey
      const query = pageParam ? `?before=${pageParam}` : sequence ? `?around=${sequence}` : ''
      return sharedRequest<ProjectChatPage>(`/api/projects/${project}/chats/${chat}/messages${query}`, { signal })
    },
    getNextPageParam: page => page.nextBefore ?? undefined, enabled: computed(() => !!auth.user && !!toValue(chatId)), retry: false, refetchInterval: computed(() => connected.value ? false : 15000) })
  const rows = computed(() => [...(messages.data.value?.pages ?? [])].reverse().flatMap(page => page.messages))
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: key.value }), client.invalidateQueries({ queryKey: ['account', auth.user?.id, 'project-passwords', toValue(projectId)] })]) }
  let channel: RealtimeChannel | null = null, epoch = 0, stopped = false
  const queue = new RefreshQueue(refresh, () => !auth.user || document.visibilityState !== 'visible', undefined, 1000)
  const resume = () => { if (document.visibilityState === 'visible') queue.request() }
  onMounted(() => {
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    watch(() => auth.user?.id, async id => {
      const attempt = ++epoch; connected.value = false
      if (channel) await supabase.removeChannel(channel)
      if (attempt !== epoch || !id || stopped) return
      const { data } = await supabase.auth.getSession()
      if (attempt !== epoch || stopped || data.session?.user.id !== id) return
      await supabase.realtime.setAuth(data.session.access_token)
      if (attempt !== epoch || stopped) return
      channel = supabase.channel(`project-chats-${id}-${crypto.randomUUID()}`, { config: { postgres_changes_options: { wait: true } } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_chat_live', filter: `user_id=eq.${id}` }, () => { if (attempt === epoch) queue.request() })
        .subscribe(status => { if (attempt !== epoch) return; connected.value = status === 'SUBSCRIBED'; if (connected.value) queue.request() })
    }, { immediate: true })
  })
  onBeforeUnmount(() => { stopped = true; epoch++; queue.stop(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); if (channel) void supabase.removeChannel(channel) })
  return { base, chats, messages, rows, connected, refresh }
}
