<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { Project } from '~~/shared/types/projects'
import type { TeamDirectory } from '~~/shared/types/team'
import ProjectChats from '~/components/ProjectsPage/ProjectChats.vue'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
const hub=useChatHubStore(),auth=useAuthStore(),projects=useProjectsData()
const search=ref(''),newDirect=ref(false),peopleSearch=ref(''),peoplePage=ref(1),error=ref(''),busy=ref(false),projectChoice=ref('')
const people=useQuery({queryKey:computed(()=>['account',auth.user?.id,'chat-people',peopleSearch.value,peoplePage.value]),queryFn:({signal})=>sharedRequest<TeamDirectory>(`/api/chats/people?q=${encodeURIComponent(peopleSearch.value)}&page=${peoplePage.value}`,{signal}),enabled:computed(()=>hub.opened&&newDirect.value),retry:false})
watch(peopleSearch,()=>{peoplePage.value=1})
const selectedChat=computed(()=>hub.items.find(item=>item.id===hub.selected?.chatId))
const activeProject=computed<Project|undefined>(()=>{
 if(!hub.selected)return undefined
 if(hub.selected.chatId&&!selectedChat.value&&!hub.loading)return undefined
 if(hub.selected.projectId)return projects.data.value?.find(project=>project.id===hub.selected!.projectId)
 const people=selectedChat.value?.people??[]
 return {id:'personal',name:'Личные сообщения',ownerId:auth.user?.id||'',permission:'viewer',revision:1,createdAt:'',updatedAt:'',sectionPermissions:{documents:'hidden',economy:'hidden',tasks:'editor'},members:people.map(person=>({userId:person.userId,fullName:person.fullName,email:'',permission:'viewer',hasAccess:true}))}
})
const list=computed(()=>hub.items.filter(item=>(hub.tab==='personal'?!item.projectId:!!item.projectId)&&`${item.name} ${item.projectName||''}`.toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru'))))
const projectOptions=computed(()=>(projects.data.value??[]).map(project=>({label:project.name,value:project.id})))
const drawer = ref<HTMLElement | null>(null)
const sidebarToggle = ref<{ $el: HTMLButtonElement } | null>(null)
const compact = ref(false)
const sidebarPreference = ref<boolean | null>(null)
const sidebarOpen = computed(() => !hub.selected || (sidebarPreference.value ?? (!compact.value && !!hub.selected.chatId)))

watch(drawer, (element, _, onCleanup) => {
  if (!element) return
  const measure = () => { compact.value = element.clientWidth < 680 }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })

function revealConversation() {
  if (compact.value) closeSidebar()
}

function closeSidebar() {
  sidebarPreference.value = null
  void nextTick(() => sidebarToggle.value?.$el.focus())
}

function selectConversation(item: (typeof list.value)[number]) {
  hub.open({ projectId: item.projectId, chatId: item.id })
  revealConversation()
}

function personRole(roleIds:string[]){return (people.data.value?.units??[]).filter(unit=>unit.kind==='role'&&roleIds.includes(unit.id)).map(unit=>unit.name).join(', ')||'Должность не указана'}
async function direct(id:string){busy.value=true;error.value='';try{await hub.direct(id);newDirect.value=false;revealConversation()}catch(failure:any){error.value=failure?.data?.message||'Не удалось открыть переписку'}finally{busy.value=false}}
function createProjectChat(){if(!projectChoice.value)return;sidebarPreference.value=null;hub.selected={projectId:projectChoice.value,chatId:''};revealConversation()}
let dragStart:{x:number;width:number;select:string}|null=null
function move(event:PointerEvent){if(dragStart)hub.width=Math.max(420,Math.min(window.innerWidth-12,dragStart.width+dragStart.x-event.clientX))}
function stop(){if(!dragStart)return;document.body.style.userSelect=dragStart.select;dragStart=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop)}
function resize(event:PointerEvent){if(hub.fullscreen||window.innerWidth<700)return;dragStart={x:event.clientX,width:hub.width,select:document.body.style.userSelect};document.body.style.userSelect='none';window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});event.preventDefault()}
function resizeKey(event:KeyboardEvent){if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();hub.width=Math.max(420,Math.min(window.innerWidth-12,hub.width+(event.key==='ArrowLeft'?24:-24)))}
onMounted(()=>{try{const saved=Number(localStorage.getItem('chat-panel-width'));if(saved>=420&&saved<=2400)hub.width=saved}catch{}})
watch(()=>hub.width,width=>{if(import.meta.client)try{localStorage.setItem('chat-panel-width',String(Math.round(width)))}catch{}})
watch(()=>hub.opened,open=>{if(!open){stop();newDirect.value=false;sidebarPreference.value=null}})
watch(()=>hub.selected,selected=>{if(!selected)sidebarPreference.value=null})
onBeforeUnmount(stop)
</script>
<template>
  <Teleport to="body">
    <div v-if="hub.opened" class="chat-drawer-backdrop" @click="hub.opened = false"/>
    <section
      v-if="hub.opened"
      ref="drawer"
      class="chat-drawer"
      :class="{ 'is-fullscreen': hub.fullscreen }"
      :style="{ '--chat-panel-width': `${hub.width}px` }"
      role="dialog"
      aria-label="Чаты"
    >
      <div v-if="!hub.fullscreen" class="chat-drawer-resize" role="separator" aria-label="Ширина панели чатов" aria-orientation="vertical" :aria-valuenow="hub.width" :aria-valuemin="420" tabindex="0" @pointerdown="resize" @keydown="resizeKey"/>
      <header class="chat-drawer-header">
        <UButton v-if="hub.selected" icon="i-lucide-arrow-left" aria-label="К списку чатов" color="neutral" variant="ghost" @click="hub.selected = null"/>
        <UButton
          v-if="hub.selected"
          ref="sidebarToggle"
          icon="i-lucide-panel-left"
          :aria-label="sidebarOpen ? 'Скрыть список чатов' : 'Показать список чатов'"
          :title="sidebarOpen ? 'Скрыть список чатов' : 'Показать список чатов'"
          aria-controls="chat-drawer-sidebar"
          :aria-expanded="sidebarOpen"
          color="neutral"
          :variant="sidebarOpen ? 'soft' : 'ghost'"
          @click="sidebarPreference = !sidebarOpen"
        />
        <h2>Чаты</h2>
        <UButton :icon="hub.fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" :aria-label="hub.fullscreen ? 'Вернуть ширину панели' : 'Открыть на весь экран'" color="neutral" variant="ghost" @click="hub.fullscreen = !hub.fullscreen"/>
        <UButton icon="i-lucide-x" aria-label="Закрыть чаты" color="neutral" variant="ghost" @click="hub.opened = false"/>
      </header>
      <div class="chat-drawer-body" :class="{ 'has-conversation': hub.selected, 'has-sidebar': sidebarOpen, 'is-compact': compact }">
        <div v-if="hub.selected && compact && sidebarOpen" class="chat-sidebar-scrim" @click="closeSidebar"/>
        <aside id="chat-drawer-sidebar" class="chat-drawer-sidebar" aria-label="Список чатов" :inert="!sidebarOpen">
          <div class="chat-sidebar-content">
            <nav class="chat-drawer-tabs" aria-label="Тип чатов">
              <button type="button" :class="{ active: hub.tab === 'personal' }" :aria-pressed="hub.tab === 'personal'" @click="hub.tab = 'personal'">Личные</button>
              <button type="button" :class="{ active: hub.tab === 'projects' }" :aria-pressed="hub.tab === 'projects'" @click="hub.tab = 'projects'">Проекты</button>
            </nav>
            <div class="chat-drawer-directory">
              <UInput v-model="search" class="w-full" icon="i-lucide-search" placeholder="Поиск чата" aria-label="Поиск чата"/>
              <UButton v-if="hub.tab === 'personal'" label="Написать пользователю" icon="i-lucide-square-pen" color="neutral" variant="outline" @click="newDirect = true; peopleSearch = ''; error = ''"/>
              <div v-else class="chat-new-project">
                <USelectMenu v-model="projectChoice" :items="projectOptions" value-key="value" placeholder="Выберите проект" :search-input="{ placeholder: 'Поиск проекта…' }" aria-label="Проект для новой беседы">
                  <template #empty>Проекты не найдены</template>
                </USelectMenu>
                <UButton label="Чаты проекта" icon="i-lucide-plus" color="neutral" variant="outline" :disabled="!projectChoice" @click="createProjectChat"/>
              </div>
              <UAlert v-if="hub.error" color="error" :description="hub.error" :actions="[{ label: 'Повторить', onClick: () => hub.refresh() }]"/>
              <p v-if="hub.loading && !hub.items.length" class="chat-drawer-hint">Загружаем чаты…</p>
              <div class="chat-drawer-list">
                <button v-for="item in list" :key="item.id" type="button" :aria-current="hub.selected?.chatId === item.id ? 'true' : undefined" @click="selectConversation(item)">
                  <PersonAvatar :name="item.name" :src="!item.projectId ? item.people.find(person => person.userId !== auth.user?.id)?.avatarUrl : undefined"/>
                  <span>
                    <strong>{{ item.name }}</strong>
                    <small>{{ item.projectId ? item.projectName : (item.lastMessagePreview || 'Нет сообщений') }}</small>
                  </span>
                  <UIcon v-if="item.muted" name="i-lucide-bell-off"/>
                  <UBadge v-if="item.unreadCount" :color="item.muted ? 'neutral' : 'primary'">{{ item.unreadCount }}</UBadge>
                </button>
                <p v-if="!list.length && !hub.loading" class="chat-drawer-hint">{{ search.trim() || hub.tab === 'projects' ? 'Чаты не найдены.' : 'Выберите пользователя, чтобы начать переписку.' }}</p>
              </div>
            </div>
          </div>
        </aside>
        <div v-if="hub.selected" class="chat-drawer-conversation" :inert="compact && sidebarOpen">
          <ProjectChats
            v-if="activeProject"
            :key="`${activeProject.id}:${hub.selected.chatId}`"
            :project="activeProject"
            embedded
            :personal="!hub.selected.projectId"
            :initial-chat-id="hub.selected.chatId"
            :initial-message-seq="hub.selected.messageSeq"
          />
          <p v-else-if="projects.isPending.value" class="chat-drawer-hint">Загружаем проект…</p>
          <UAlert v-else color="warning" title="Беседа недоступна" description="Проверьте доступ к проекту."/>
        </div>
      </div>
      <UModal v-model:open="newDirect" title="Новое личное сообщение" description="Выберите сотрудника или найдите его по имени или email."><template #body><div class="chat-drawer-people"><UInput v-model="peopleSearch" icon="i-lucide-search" placeholder="Поиск сотрудника" aria-label="Поиск пользователя"/><UAlert v-if="error||people.error.value" color="error" :description="error||'Не удалось найти пользователей'"/><button v-for="person in people.data.value?.people.filter(person=>person.id!==auth.user?.id)||[]" :key="person.id" :disabled="busy" @click="direct(person.id)"><PersonAvatar :name="person.fullName||person.email" :src="person.avatarUrl"/><span>{{person.fullName||person.email}}<small>{{personRole(person.roleIds)}}</small><small>{{person.email}}</small></span></button><p v-if="!people.isPending.value&&!people.error.value&&!people.data.value?.people.some(person=>person.id!==auth.user?.id)" class="chat-drawer-hint">Сотрудники не найдены.</p><p v-if="people.isFetching.value" class="chat-drawer-hint">Ищем пользователей…</p><div v-if="people.data.value&&people.data.value.total>50" class="chat-new-project"><UButton label="Назад" color="neutral" variant="ghost" :disabled="peoplePage<=1" @click="peoplePage--"/><UButton label="Далее" color="neutral" variant="ghost" :disabled="peoplePage*50>=people.data.value.total" @click="peoplePage++"/></div></div></template></UModal>
    </section>
  </Teleport>
</template>
<style scoped>
.chat-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: #1e293b26;
  z-index: 79;
}

.chat-drawer {
  --drawer-inset: 8px;
  --sidebar-width: 248px;
  position: fixed;
  inset: var(--drawer-inset) var(--drawer-inset) var(--drawer-inset) auto;
  width: min(var(--chat-panel-width), calc(100% - 2 * var(--drawer-inset)));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 12px 45px #1e293b25;
  z-index: 80;
}

.chat-drawer.is-fullscreen { width: calc(100% - 2 * var(--drawer-inset)); }
.chat-drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.chat-drawer-header h2 { font-size: 17px; font-weight: 600; flex: 1; }
.chat-drawer-resize {
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  cursor: ew-resize;
  touch-action: none;
  z-index: 30;
}
.chat-drawer-resize:focus-visible { outline: 2px solid #6295b8; outline-offset: -2px; }

.chat-drawer-body {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.chat-drawer-body.has-conversation {
  grid-template-columns: 0 minmax(0, 1fr);
  transition: grid-template-columns 180ms ease;
}
.chat-drawer-body.has-conversation.has-sidebar { grid-template-columns: var(--sidebar-width) minmax(0, 1fr); }
.chat-drawer-sidebar,
.chat-sidebar-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.chat-drawer-sidebar { overflow: hidden; background: #fff; }
.has-conversation .chat-sidebar-content {
  width: var(--sidebar-width);
  flex: 1;
  border-right: 1px solid #e2e8f0;
}
.chat-drawer-body.has-conversation.is-compact { grid-template-columns: minmax(0, 1fr); }
.is-compact.has-conversation .chat-drawer-sidebar {
  position: absolute;
  inset: 0 auto 0 0;
  width: min(85%, 288px);
  z-index: 26;
  transform: translateX(-100%);
  transition: transform 180ms ease;
}
.is-compact.has-conversation.has-sidebar .chat-drawer-sidebar { transform: translateX(0); }
.is-compact.has-conversation .chat-sidebar-content { width: 100%; }
.chat-sidebar-scrim {
  position: absolute;
  inset: 0;
  background: #1e293b38;
  z-index: 25;
}

.chat-drawer-directory { display: flex; flex-direction: column; gap: 14px; padding: 16px; min-height: 0; flex: 1; }
.chat-drawer-tabs { display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #eef2f6; flex-shrink: 0; }
.chat-drawer-tabs button { padding: 9px 16px; border-radius: 9px; font-size: 13px; color: #64748b; }
.chat-drawer-tabs button.active { background: #eef2ff; color: #333159; font-weight: 600; }
.chat-drawer-list { overflow: auto; flex: 1; min-height: 0; overscroll-behavior: contain; }
.chat-drawer-list > button,
.chat-drawer-people > button { display: flex; align-items: center; gap: 12px; text-align: left; width: 100%; padding: 14px 8px; border-bottom: 1px solid #eef2f6; border-radius: 10px; }
.chat-drawer-list > button > span:nth-child(2) { flex: 1; min-width: 0; display: grid; gap: 6px; }
.chat-drawer-list strong { font-size: 13px; overflow-wrap: anywhere; }
.chat-drawer-list small,
.chat-drawer-people small { display: block; font-size: 11px; color: #64748b; }
.chat-drawer-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-drawer-list > button:hover,
.chat-drawer-people > button:hover { background: #f6f8fb; }
.chat-drawer-list > button[aria-current="true"] { background: #eef2ff; }
.chat-drawer-list > button:focus-visible,
.chat-drawer-tabs button:focus-visible { outline: 2px solid #6295b8; outline-offset: -2px; }
.chat-drawer-conversation { display: flex; min-width: 0; min-height: 0; }
.chat-drawer-conversation > :deep(.project-chats) { flex: 1; min-height: 0; }
.chat-drawer-hint { font-size: 12px; color: #64748b; line-height: 1.8; padding: 14px; }
.chat-new-project { display: flex; gap: 8px; flex-wrap: wrap; }
.chat-new-project > * { flex: 1; }
.has-conversation .chat-new-project > * { flex-basis: 100%; min-width: 0; }
.chat-drawer-people { display: grid; gap: 10px; max-height: 65vh; overflow: auto; }
.chat-drawer-people > button > span { min-width: 0; overflow-wrap: anywhere; }
.chat-drawer-people small { margin-top: 4px; }

@media (max-width: 700px) {
  .chat-drawer { --drawer-inset: 4px; width: calc(100% - 2 * var(--drawer-inset)); }
  .chat-drawer-resize { display: none; }
  .chat-drawer-header { padding-inline: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .chat-drawer-body.has-conversation,
  .is-compact.has-conversation .chat-drawer-sidebar { transition: none; }
}
</style>
