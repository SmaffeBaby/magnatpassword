<script setup lang="ts">
import { canViewProjectSection } from '~~/shared/utils/project-permissions'
import {useQuery,useQueryClient} from '@tanstack/vue-query'
import {projectTaskView,projectTaskViews} from '~~/shared/utils/project-task-planning'
import {todayDate} from '~~/shared/utils/subscriptions'
import type {KabanTaskDeadlinePreview,KabanWorkspace} from '~~/shared/types/kaban'
import KabanProjectCard from '~/components/Kaban/KabanProjectCard.vue'
import KabanProjectPlanning from '~/components/Kaban/KabanProjectPlanning.vue'
import KabanTaskDirectory from '~/components/Kaban/KabanTaskDirectory.vue'
definePageMeta({layout:'home'})
const route=useRoute(),projects=useProjectsData(),access=useProjectAccess(),auth=useAuthStore()
const {search,folder}=useKabanDirectoryNavigation()
bindSavedFilters('kaban-projects', reactive({search,folder}), true, { search: '', folder: 'all' })
if(route.query.legacy==='1'||route.query.vault||route.query.task)await navigateTo({path:'/kaban-legacy',query:route.query},{replace:true})
const client=useQueryClient()
const planningMode=computed(()=>{const view=projectTaskView(route.query.view);return view==='board'?null:view})
const mode=computed(()=>planningMode.value??(route.query.view==='mine'?'mine':route.query.view==='all'?'all':'projects'))
const taskProjects=computed(()=>(projects.data.value??[]).filter(p=>canViewProjectSection(p,'tasks')&&!p.profile?.archived))
const visible=computed(()=>taskProjects.value.filter(p=>(folder.value==='all'||p.folderId===folder.value)&&p.name.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru'))))
const boardProjects=computed(()=>planningMode.value?taskProjects.value:visible.value)
const {selectedProjects}=toRefs(useSavedFilters(() => `kaban-planning-projects:${planningMode.value ?? 'board'}`, {selectedProjects:[] as string[]}))
const planningProjectOptions=computed(()=>taskProjects.value.map(project=>({label:project.name,value:project.id})).sort((a,b)=>a.label.localeCompare(b.label,'ru')))
const boardQueryKey=computed(()=>['account',auth.user?.id,'kaban-project-tasks',boardProjects.value.map(p=>p.id).sort().join(',')])
const boards=useQuery({queryKey:boardQueryKey,enabled:computed(()=>!!auth.user&&mode.value!=='projects'&&access.data.value?.allowed===true&&!projects.isPending.value),queryFn:async({signal})=>{
 const results=await Promise.allSettled(boardProjects.value.map(async p=>({project:p,workspace:await sharedRequest<KabanWorkspace>(`/api/kaban?project=${p.id}`,{signal})})))
 return {boards:results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),failed:results.filter(r=>r.status==='rejected').length}
},retry:false,refetchInterval:30000})
const deadlineProjectIds = computed(() => taskProjects.value.filter(project => project.taskCount !== 0).map(project => project.id).sort())
const deadlineQueryKey = computed(() => ['account', auth.user?.id, 'kaban-project-deadlines', deadlineProjectIds.value] as const)
const deadlines = useQuery({
  queryKey: deadlineQueryKey,
  enabled: computed(() => !!auth.user && mode.value === 'projects' && access.data.value?.allowed === true && deadlineProjectIds.value.length > 0),
  queryFn: async ({ queryKey: [, , , ids], signal }) => {
    const results = await Promise.allSettled(ids.map(async id => [
      id,
      await sharedRequest<KabanTaskDeadlinePreview[]>(`/api/kaban?project=${id}&summary=deadlines`, { signal })
    ] as const))
    return {
      byProject: Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])),
      failed: results.some(result => result.status === 'rejected')
    }
  },
  retry: false,
  refetchInterval: 30_000
})
const planningBoards=computed(()=>{
 const current=new Map(taskProjects.value.map(project=>[project.id,project]))
 return (boards.data.value?.boards??[]).flatMap(entry=>{
  const project=current.get(entry.project.id)
  return project&&(!selectedProjects.value.length||selectedProjects.value.includes(project.id))?[{...entry,project}]:[]
 })
})
watch(taskProjects,items=>{if(projects.data.value)selectedProjects.value=selectedProjects.value.filter(id=>items.some(item=>item.id===id))})
async function refreshBoards(){
 const accountId=auth.user?.id
 // An event during an in-flight read must trigger a new read after the committed change.
 await client.cancelQueries({queryKey:boardQueryKey.value,exact:true})
 if(auth.user?.id!==accountId||mode.value==='projects'||access.data.value?.allowed!==true)return
 await boards.refetch()
}
useKabanRealtime(async () => {
  if (mode.value !== 'projects') return refreshBoards()
  const key = deadlineQueryKey.value
  await client.cancelQueries({ queryKey: key, exact: true })
  if (auth.user?.id !== key[1] || mode.value !== 'projects' || access.data.value?.allowed !== true) return
  await Promise.all([projects.refetch(), deadlineProjectIds.value.length ? deadlines.refetch() : undefined])
}, () => access.data.value?.allowed !== true)

const today = ref(todayDate())
let dateTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  today.value = todayDate()
  dateTimer = setInterval(() => { today.value = todayDate() }, 60_000)
})
onBeforeUnmount(() => clearInterval(dateTimer))
</script>
<template><section class="projects-workspace"><header class="projects-heading"><div><h1>{{mode==='mine'?'Мои задачи':mode==='all'?'Все задачи':planningMode?projectTaskViews.find(view=>view.value===planningMode)?.label:'Задачи'}}<span class="title-dot">.</span></h1><p>{{mode==='projects'?'Доски задач ваших проектов.':'Задачи из доступных проектов.'}}</p></div><UButton v-if="mode==='projects'" to="/projects?create=1" label="Добавить проект" icon="i-lucide-plus"/></header><p v-if="access.isPending.value||projects.isPending.value&&access.data.value?.allowed">Загружаем проекты…</p><UAlert v-else-if="access.error.value" color="error" title="Не удалось проверить доступ"/><UAlert v-else-if="!access.data.value?.allowed" color="neutral" title="Доступ к проектам закрыт"/><UAlert v-if="projects.error.value" color="error" title="Не удалось загрузить проекты" :actions="[{label:'Повторить',onClick:()=>projects.refetch()}]"/><template v-if="access.data.value?.allowed"><nav class="mb-5 flex flex-wrap items-center gap-2" aria-label="Представления задач">
  <UButton v-for="view in projectTaskViews" :key="view.value" :to="view.value==='board'?'/kaban':{path:'/kaban',query:{view:view.value}}"
    :label="view.label" :icon="view.icon" color="neutral" :variant="(view.value==='board'? mode==='projects': mode===view.value)?'soft':'outline'"
    :aria-current="(view.value==='board'? mode==='projects': mode===view.value)?'page':undefined"/>
</nav>
<UButton v-if="!planningMode && folder!=='all'" label="Все папки" icon="i-lucide-arrow-left" color="neutral" variant="ghost" class="mb-5" @click="folder='all'"/>
<template v-if="mode==='projects'">
  <UAlert v-if="deadlines.data.value?.failed" color="neutral" title="Не удалось загрузить часть ближайших задач" :actions="[{label:'Повторить',onClick:()=>deadlines.refetch()}]" class="mb-4" />
  <div v-if="visible.length" class="kaban-projects">
    <KabanProjectCard v-for="project in visible" :key="project.id" :project="project" :deadlines="deadlines.data.value?.byProject[project.id]" :today="today" />
  </div>
  <p v-else-if="!projects.isPending.value && !projects.error.value" class="kaban-projects-empty">Проекты не найдены.</p>
</template>
<template v-else-if="planningMode">
  <div class="mb-4 flex flex-wrap items-end gap-2">
    <UFormField label="Проекты" class="min-w-0 w-full max-w-sm">
      <USelectMenu v-model="selectedProjects" :items="planningProjectOptions" value-key="value" multiple placeholder="Все доступные проекты" aria-label="Проекты на шкале" class="w-full" />
    </UFormField>
    <UButton v-if="selectedProjects.length" label="Показать все проекты" color="neutral" variant="ghost" @click="selectedProjects=[]"/>
  </div>
  <p v-if="boards.isPending.value && !projects.error.value" role="status">Загружаем задачи…</p>
  <UAlert v-if="boards.error.value || boards.data.value?.failed" color="error" title="Часть досок не удалось загрузить" :actions="[{label:'Повторить',onClick:refreshBoards}]" class="mb-4"/>
  <p v-if="!taskProjects.length && !projects.isPending.value && !projects.error.value">Нет доступных проектов с задачами.</p>
  <KabanProjectPlanning v-if="!projects.error.value && planningBoards.length" :mode="planningMode" :boards="planningBoards" :reload="refreshBoards"/>
</template>
<KabanTaskDirectory v-else-if="mode === 'mine' || mode === 'all'" :mode="mode" :boards="boards.data.value?.boards ?? []" :projects="visible" :loading="boards.isPending.value">
  <UAlert v-if="boards.error.value||boards.data.value?.failed" color="error" title="Часть досок не удалось загрузить" :actions="[{label:'Повторить',onClick:()=>boards.refetch()}]" class="mb-5"/>
</KabanTaskDirectory>
</template></section></template>
<style scoped>
.kaban-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:16px}
.kaban-projects-empty{padding:24px;border:1px dashed var(--ui-border);border-radius:16px;color:var(--ui-text-muted);text-align:center}
</style>
