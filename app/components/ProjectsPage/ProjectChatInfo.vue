<script setup lang="ts">
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'
import type { ChatMaterialPage, ProjectChat, ProjectChatParticipant } from '~~/shared/types/project-chats'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import ProjectChatAttachment from './ProjectChatAttachment.vue'

const props = defineProps<{
  chat: ProjectChat
  projectId: string
  personal: boolean
  name: string
  avatar?: string
  status: string
  online?: boolean
  canManage: boolean
  muteBusy: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; write: []; mute: []; pins: []; manage: []; avatar: []; jump: [message: { seq: number }] }>()
const auth = useAuthStore()
const hub = useChatHubStore()
const peerId = computed(() => props.personal ? props.chat.members.find(member => member.userId !== auth.user?.id)?.userId : undefined)
const profilePath = (id: string) => id === auth.user?.id ? '/profile' : `/team/${id}`
function onProfileClick(event: MouseEvent) {
  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) hub.opened = false
}
const base = computed(() => `/api/projects/${props.projectId}/chats/${props.chat.id}`)
const key = computed(() => ['account', auth.user?.id, 'project-chats', props.projectId, props.chat.id] as const)
const back = ref<{ $el: HTMLButtonElement } | null>(null)
onMounted(() => back.value?.$el.focus())

const sharedTabs = [
  { value: 'media', label: 'Медиа' },
  { value: 'files', label: 'Файлы' },
  { value: 'links', label: 'Ссылки' },
  { value: 'gifs', label: 'GIF' }
]
const tabs = computed(() => props.personal ? sharedTabs : [{ value: 'members', label: 'Участники' }, ...sharedTabs])
const tab = ref(props.personal ? 'media' : 'members')

const participants = useQuery({
  queryKey: computed(() => [...key.value, 'participants']),
  queryFn: ({ signal }) => sharedRequest<ProjectChatParticipant[]>(`${base.value}/participants`, { signal }),
  enabled: computed(() => !!auth.user && !props.personal),
  refetchInterval: 30_000,
  retry: false
})
const onlineCount = computed(() => participants.data.value?.filter(person => person.online).length)
const infoStatus = computed(() => props.personal ? props.status : `Участников: ${props.chat.members.length}${onlineCount.value === undefined ? '' : ` · В сети: ${onlineCount.value}`}`)
const activityDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
function activity(person: ProjectChatParticipant) {
  if (person.online) return 'В сети'
  return person.lastSeenAt ? `Был(а) ${activityDate.format(new Date(person.lastSeenAt))}` : 'Активность неизвестна'
}

const search = ref(''), term = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(tab, () => { clearTimeout(searchTimer); search.value = ''; term.value = '' }, { flush: 'sync' })
watch(search, value => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { term.value = value.trim() }, 250)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const searchLabels: Record<string, string> = { members: 'Поиск участника', media: 'Поиск медиа', files: 'Поиск файла', links: 'Поиск ссылки', gifs: 'Поиск GIF' }
const memberRows = computed(() => (participants.data.value ?? []).filter(person =>
  search.value.trim().toLocaleLowerCase('ru').split(/\s+/).every(part => person.name.toLocaleLowerCase('ru').includes(part))
))
const materials = useInfiniteQuery({
  queryKey: computed(() => [...key.value, 'materials', tab.value, term.value] as const),
  queryFn: ({ signal, pageParam, queryKey }) => {
    const [, , , project, chat, , type, query] = queryKey
    const params = new URLSearchParams({ tab: type, q: query })
    if (pageParam) params.set('before', String(pageParam))
    return sharedRequest<ChatMaterialPage>(`/api/projects/${project}/chats/${chat}/materials?${params}`, { signal })
  },
  initialPageParam: null as number | null,
  getNextPageParam: page => page.nextBefore ?? undefined,
  enabled: computed(() => !!auth.user && tab.value !== 'members'),
  retry: false
})
const materialRows = computed(() => (materials.data.value?.pages ?? []).flatMap(page => page.items))
watch([materials.isFetching, materials.hasNextPage, materialRows], ([fetching, more, items]) => {
  if (term.value && tab.value !== 'members' && !fetching && more && !items.length && !materials.error.value) void materials.fetchNextPage()
})
const mediaGrid = computed(() => tab.value === 'media' || tab.value === 'gifs')
</script>

<template>
  <section class="chat-info" :aria-label="personal ? 'Сведения о собеседнике' : 'Сведения о беседе'" @keydown.esc.stop="emit('close')">
    <header class="chat-info-bar">
      <UButton ref="back" icon="i-lucide-arrow-left" aria-label="Вернуться в переписку" color="neutral" variant="ghost" @click="emit('close')"/>
      <UButton v-if="canManage" icon="i-lucide-settings-2" label="Настройки" color="neutral" variant="ghost" @click="emit('manage')"/>
    </header>
    <div class="chat-info-scroll">
      <div class="chat-info-content">
        <div class="chat-info-heading">
          <NuxtLink v-if="peerId" :to="profilePath(peerId)" aria-label="Открыть профиль собеседника" @click="onProfileClick">
            <PersonAvatar class="chat-info-avatar" :name="name" :src="avatar"/>
          </NuxtLink>
          <PersonAvatar v-else class="chat-info-avatar" :name="name" :src="avatar"/>
          <h2><NuxtLink v-if="peerId" :to="profilePath(peerId)" @click="onProfileClick">{{ name }} <UIcon name="i-lucide-arrow-up-right"/></NuxtLink><template v-else>{{ name }}</template></h2>
          <p v-if="infoStatus" :class="{ 'is-online': personal && online }">{{ infoStatus }}</p>
        </div>
        <div class="chat-info-actions">
          <button type="button" @click="emit('write')"><UIcon name="i-lucide-message-circle"/>Написать</button>
          <button type="button" :disabled="muteBusy" @click="emit('mute')">
            <UIcon :name="chat.muted ? 'i-lucide-bell' : 'i-lucide-bell-off'"/>{{ chat.muted ? 'Включить звук' : 'Без звука' }}
          </button>
          <button type="button" @click="emit('pins')"><UIcon name="i-lucide-pin"/>Закреплённые</button>
          <button v-if="canManage" type="button" @click="emit('avatar')"><UIcon name="i-lucide-image"/>Фото беседы</button>
        </div>
        <UAlert v-if="error" class="mb-3" color="error" :description="error"/>

        <UTabs v-model="tab" :items="tabs" aria-label="Сведения и материалы" color="neutral" :ui="{ list: 'self-start max-w-full overflow-x-auto rounded-xl', trigger: 'shrink-0 whitespace-nowrap', content: 'min-w-0' }">
          <template #content>
            <UInput v-model="search" class="chat-info-search w-full" icon="i-lucide-search" :placeholder="searchLabels[tab]" :aria-label="searchLabels[tab]" :maxlength="200"/>
            <template v-if="tab === 'members'">
              <UAlert v-if="participants.error.value" color="error" title="Не удалось загрузить участников" :actions="[{ label: 'Повторить', onClick: () => participants.refetch() }]"/>
              <p v-else-if="participants.isPending.value" class="chat-info-status">Загружаем участников…</p>
              <ul v-else-if="memberRows.length" class="chat-info-list">
                <li v-for="person in memberRows" :key="person.userId">
                  <NuxtLink :to="profilePath(person.userId)" class="chat-info-member" @click="onProfileClick">
                    <PersonAvatar :name="person.name" :src="person.avatarUrl"/>
                    <span><strong>{{ person.name }}</strong><small :class="{ 'is-online': person.online }">{{ activity(person) }}</small></span>
                    <UBadge v-if="person.userId === chat.createdBy" label="Создатель" color="primary" variant="soft" size="sm"/>
                    <UIcon class="chat-profile-arrow" name="i-lucide-chevron-right"/>
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="chat-info-status">Участники не найдены.</p>
            </template>
            <template v-else>
              <UAlert v-if="materials.error.value" color="error" title="Не удалось загрузить материалы" :actions="[{ label: 'Повторить', onClick: () => materials.refetch() }]"/>
              <p v-if="search.trim() !== term || (materials.isFetching.value && !materialRows.length)" class="chat-info-status">{{ search.trim() ? 'Ищем в истории беседы…' : 'Загружаем материалы…' }}</p>
              <div v-else-if="materialRows.length" :class="mediaGrid ? 'chat-info-media' : 'chat-info-list'">
                <template v-for="item in materialRows" :key="`${item.seq}:${item.url ?? item.file?.id}:${item.file?.revision ?? ''}`">
                  <button v-if="item.url" type="button" class="chat-info-link" title="Перейти к сообщению" @click="emit('jump', item)">
                    <UIcon name="i-lucide-link"/><span>{{ item.url }}</span><UIcon name="i-lucide-arrow-up-right"/>
                  </button>
                  <button v-else-if="item.file" type="button" class="chat-info-file" :title="item.file.name" :aria-label="`Перейти к сообщению с вложением ${item.file.name}`" @click="emit('jump', item)">
                    <ProjectChatAttachment :file="item.file" :project-id="projectId" :chat-id="chat.id" preview-mode="pinned"/>
                  </button>
                </template>
              </div>
              <p v-else-if="!materials.error.value" class="chat-info-status">{{ materials.hasNextPage.value ? 'В просмотренной истории материалов нет.' : term ? 'По этому запросу ничего не найдено.' : 'В этой беседе пока нет таких материалов.' }}</p>
              <UButton v-if="materials.hasNextPage.value && search.trim() === term" class="chat-info-more" label="Загрузить более ранние" color="neutral" variant="outline" :loading="materials.isFetchingNextPage.value" @click="materials.fetchNextPage()"/>
            </template>
          </template>
        </UTabs>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat-info { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #f0f4f8; }
.chat-info-bar { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #dbe5ef; background: #f8fbfe; }
.chat-info-scroll { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; }
.chat-info-content { max-width: 690px; margin-inline: auto; padding: 16px clamp(12px, 3vw, 28px) 28px; }
.chat-info-heading { display: grid; justify-items: center; gap: 6px; text-align: center; }
.chat-info-heading .chat-info-avatar { width: 96px; height: 96px; border: 3px solid #fff; border-radius: 50%; font-size: 29px; box-shadow: 0 4px 14px #34557320; }
.chat-info-heading h2 { color: #26374d; font-size: 23px; font-weight: 650; overflow-wrap: anywhere; }
.chat-info-heading p, .chat-info-status { color: #566980; font-size: 12px; }
.chat-info-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 8px; margin: 18px 0; }
.chat-info-actions button { display: grid; gap: 5px; justify-items: center; align-content: center; min-height: 62px; padding: 6px; border: 1px solid #dce5ef; border-radius: 12px; background: #fff; color: #356c9e; font-weight: 600; font-size: 11px; }
.chat-info-actions .iconify { width: 19px; height: 19px; }
.chat-info-actions button:disabled { opacity: .55; }
.chat-info-list { display: grid; border: 1px solid #dce5ef; border-radius: 12px; background: #fff; }
.chat-info-list > * + * { border-top: 1px solid #e3eaf2; }
.chat-info-member, .chat-info-link, .chat-info-file { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 9px 12px; text-align: left; }
.chat-info-member > span:nth-child(2), .chat-info-link > span:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 2px; overflow-wrap: anywhere; }
.chat-info-member .person-avatar { width: 34px; height: 34px; border-radius: 50%; }
.chat-info-member strong, .chat-info-link { color: #26374d; font-size: 13px; }
.chat-info-member small { color: #566980; font-size: 11px; }
.chat-info .is-online { color: #147354; font-weight: 600; }
.chat-info-link .iconify { flex-shrink: 0; color: #356c9e; }
.chat-info-media { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(135px, 100%), 1fr)); gap: 8px; }
.chat-info-media .chat-info-file { justify-content: center; align-items: center; min-height: 92px; border-radius: 12px; background: #fff; }
.chat-info-actions button:not(:disabled):hover, .chat-info-link:hover, .chat-info-file:hover { background: #e7f0fa; }
.chat-info button:focus-visible { outline: 2px solid #356c9e; outline-offset: -2px; }
.chat-info-status { margin: 12px 0; }
.chat-info-search { margin: 8px 0 12px; }
.chat-info-member:hover { background: #e7f0fa; }
.chat-profile-arrow { flex-shrink: 0; color: #607892; }
.chat-info-heading h2 a:hover { color: #356c9e; }
.chat-info-heading h2 .iconify { width: 15px; height: 15px; color: #607892; }
.chat-info-more { margin-top: 12px; }
</style>
