<script setup lang="ts">
import { canViewProjectSection } from '~~/shared/utils/project-permissions'
import {useQuery,useQueryClient} from '@tanstack/vue-query'
import {filterKabanTaskRows} from '~~/shared/utils/kaban-task-directory'
import {projectTaskView,projectTaskViews} from '~~/shared/utils/project-task-planning'
import {dateLabel,todayDate} from '~~/shared/utils/subscriptions'
import type {KabanTaskDeadlinePreview,KabanWorkspace} from '~~/shared/types/kaban'
import KabanProjectCard from '~/components/Kaban/KabanProjectCard.vue'
import KabanProjectPlanning from '~/components/Kaban/KabanProjectPlanning.vue'
import KabanTaskDeadline from '~/components/Kaban/KabanTaskDeadline.vue'
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

const allTasks=computed(()=>(boards.data.value?.boards??[]).flatMap(({project,workspace})=>workspace.tasks.filter(t=>!t.archived&&(mode.value!=='mine'||t.creatorId===auth.user?.id||t.participantIds.includes(auth.user?.id||''))).map(task=>({task,project,stage:workspace.board.stages.find(s=>s.id===task.stageId)}))).sort((a,b)=>b.task.updatedAt.localeCompare(a.task.updatedAt)))
const taskFilters=useSavedFilters(() => `kaban-tasks:${mode.value}`,{search:'',project:'all',stage:'all',deadline:'all'})
const today=ref(todayDate())
let dateTimer:ReturnType<typeof setInterval>|undefined
onMounted(()=>{today.value=todayDate();dateTimer=setInterval(()=>{today.value=todayDate()},60000)})
onBeforeUnmount(()=>clearInterval(dateTimer))
const projectOptions=computed(()=>[{label:'Все проекты',value:'all'},...visible.value.map(p=>({label:p.name,value:p.id}))])
const stageOptions=computed(()=>[{label:'Все стадии',value:'all'},...[...new Set(allTasks.value.filter(row=>taskFilters.project==='all'||row.project.id===taskFilters.project).flatMap(row=>row.stage?[row.stage.name]:[]))].sort((a,b)=>a.localeCompare(b,'ru')).map(name=>({label:name,value:name}))])
const tasks=computed(()=>filterKabanTaskRows(allTasks.value,taskFilters,today.value))
const hasTaskFilters=computed(()=>!!taskFilters.search.trim()||taskFilters.project!=='all'||taskFilters.stage!=='all'||taskFilters.deadline!=='all')
function resetTaskFilters(){Object.assign(taskFilters,{search:'',project:'all',stage:'all',deadline:'all'})}


</script>
<template><section class="projects-workspace"><header class="projects-heading"><div><h1>{{mode==='mine'?'Мои задачи':mode==='all'?'Все задачи':planningMode?projectTaskViews.find(view=>view.value===planningMode)?.label:'Задачи'}}<span class="title-dot">.</span></h1><p>{{mode==='projects'?'Доски задач ваших проектов.':'Открытые задачи из доступных проектов.'}}</p></div><UButton v-if="mode==='projects'" to="/projects?create=1" label="Добавить проект" icon="i-lucide-plus"/></header><p v-if="access.isPending.value||projects.isPending.value&&access.data.value?.allowed">Загружаем проекты…</p><UAlert v-else-if="access.error.value" color="error" title="Не удалось проверить доступ"/><UAlert v-else-if="!access.data.value?.allowed" color="neutral" title="Доступ к проектам закрыт"/><UAlert v-if="projects.error.value" color="error" title="Не удалось загрузить проекты" :actions="[{label:'Повторить',onClick:()=>projects.refetch()}]"/><template v-if="access.data.value?.allowed"><nav class="mb-5 flex flex-wrap items-center gap-2" aria-label="Представления задач">
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
<template v-else><div class="task-filters"><UInput v-model="taskFilters.search" icon="i-lucide-search" placeholder="Найти задачу…" aria-label="Поиск задач"/><USelect :model-value="taskFilters.project" @update:model-value="value=>{taskFilters.project=value;taskFilters.stage='all'}" :items="projectOptions" aria-label="Проект задачи"/><USelect v-model="taskFilters.stage" :items="stageOptions" aria-label="Стадия задачи"/><USelect v-model="taskFilters.deadline" :items="[{label:'Любой срок',value:'all'},{label:'Просроченные',value:'overdue'},{label:'На сегодня',value:'today'},{label:'Ближайшие 7 дней',value:'week'},{label:'Без срока',value:'none'}]" aria-label="Срок задачи"/><UButton v-if="hasTaskFilters" label="Сбросить" icon="i-lucide-x" color="neutral" variant="ghost" @click="resetTaskFilters"/></div><p v-if="!boards.isPending.value" class="task-result-count" role="status">Найдено задач: {{tasks.length}}</p><p v-if="boards.isPending.value">Загружаем задачи…</p><UAlert v-if="boards.error.value||boards.data.value?.failed" color="error" title="Часть досок не удалось загрузить" :actions="[{label:'Повторить',onClick:()=>boards.refetch()}]" class="mb-5"/>
<div class="kaban-task-list">
  <NuxtLink v-for="row in tasks" :key="`${row.project.id}:${row.task.id}`" :to="{path:`/projects/${row.project.id}/tasks`,query:{task:row.task.id}}">
    <span class="task-dot" :style="{background:row.stage?.color||'#94a3b8'}"/>
    <div class="task-list-summary">
      <strong>{{ row.task.title }}</strong>
      <small>{{ row.project.name }} · {{ row.stage?.name || 'Без стадии' }}</small>
    </div>
    <div class="task-list-deadline">
      <time v-if="row.task.dueOn" :datetime="row.task.dueOn">{{ dateLabel(row.task.dueOn) }}</time>
      <span v-else>Без срока</span>
      <KabanTaskDeadline :task="row.task" :today="today" :done="row.stage?.done" compact />
    </div>
    <UIcon name="i-lucide-arrow-up-right" class="task-list-arrow" aria-hidden="true"/>
  </NuxtLink>
  <p v-if="!tasks.length&&!boards.isPending.value">Задачи не найдены.</p>
</div>
</template></template></section></template>
<style scoped>
.task-filters{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.task-filters>:first-child{flex:1;min-width:220px}.task-filters>:not(:first-child){min-width:160px}.task-result-count{font-size:12px;color:#94a3b8;margin:0 0 18px}@media(max-width:600px){.task-filters>*{width:100%;min-width:0!important}}
.kaban-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:16px}
.kaban-projects-empty{padding:24px;border:1px dashed var(--ui-border);border-radius:16px;color:var(--ui-text-muted);text-align:center}
.kaban-task-list small{color:#94a3b8}
.kaban-task-list{display:grid;gap:12px}
.kaban-task-list>a{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,12rem) auto;align-items:center;gap:16px;border:1px solid #e2e8f0;border-radius:16px;padding:20px;background:#fff}
.task-list-summary{min-width:0;overflow-wrap:anywhere}
.kaban-task-list small{display:block;margin-top:6px}
.task-dot{height:9px;width:9px;border-radius:50%}
.task-list-deadline{display:grid;gap:4px;text-align:right}
.task-list-deadline>time,.task-list-deadline>span,.task-list-arrow{font-size:12px;color:#8292a8}
@media(max-width:600px){
  .kaban-task-list>a{grid-template-columns:auto minmax(0,1fr) auto;gap:10px 12px}
  .task-list-deadline{grid-column:2;grid-row:2;max-width:12rem;text-align:left}
  .task-list-arrow{grid-column:3;grid-row:1}
}
</style>
