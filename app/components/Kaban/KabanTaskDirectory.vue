<script setup lang="ts">
import type { KabanWorkspace } from '~~/shared/types/kaban'
import type { Project } from '~~/shared/types/projects'
import type { ProjectTaskListMode } from '~~/shared/utils/project-task-planning'
import { filterKabanTaskRows } from '~~/shared/utils/kaban-task-directory'
import { dateLabel, todayDate } from '~~/shared/utils/subscriptions'
import KabanTaskDeadline from './KabanTaskDeadline.vue'

type TaskProject = Pick<Project, 'id' | 'name'>
const props = defineProps<{
  mode: ProjectTaskListMode
  boards: { project: TaskProject; workspace: KabanWorkspace }[]
  projects?: TaskProject[]
  projectId?: string
  loading?: boolean
}>()
const auth = useAuthStore()
const defaultFilters = { search: '', project: 'all', stage: 'all', deadline: 'all', showCompleted: false }
const taskFilters = useSavedFilters(() => props.projectId
  ? `kaban-tasks:project:${props.projectId}:${props.mode}`
  : `kaban-tasks:${props.mode}`, { ...defaultFilters })
const allTasks = computed(() => props.boards.flatMap(({ project, workspace }) => {
  const stages = new Map(workspace.board.stages.map(stage => [stage.id, stage]))
  const userId = auth.user?.id
  return workspace.tasks
    .filter(task => !task.archived && (props.mode === 'all'
      || (userId && (task.creatorId === userId || task.participantIds.includes(userId)))))
    .map(task => ({ task, project, stage: stages.get(task.stageId) }))
}).sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt)))

const visibleTaskRows = computed(() => taskFilters.showCompleted ? allTasks.value : allTasks.value.filter(row => !row.stage?.done))
const projectOptions = computed(() => [
  { label: 'Все проекты', value: 'all' },
  ...(props.projects ?? []).map(project => ({ label: project.name, value: project.id }))
])
const stageOptions = computed(() => {
  const names = new Set(visibleTaskRows.value
    .filter(row => taskFilters.project === 'all' || row.project.id === taskFilters.project)
    .flatMap(row => row.stage ? [row.stage.name] : []))
  return [{ label: 'Все стадии', value: 'all' }, ...[...names].sort((a, b) => a.localeCompare(b, 'ru')).map(name => ({ label: name, value: name }))]
})
const selectedStageHidden = computed(() => !taskFilters.showCompleted
  && !stageOptions.value.some(option => option.value === taskFilters.stage)
  && allTasks.value.some(row => row.stage?.done && row.stage.name === taskFilters.stage
    && (taskFilters.project === 'all' || row.project.id === taskFilters.project)))
watch(selectedStageHidden, hidden => {
  if (hidden) taskFilters.stage = 'all'
}, { immediate: true })
const today = ref(todayDate())
let dateTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  today.value = todayDate()
  dateTimer = setInterval(() => { today.value = todayDate() }, 60_000)
})
onBeforeUnmount(() => clearInterval(dateTimer))
const tasks = computed(() => filterKabanTaskRows(visibleTaskRows.value, taskFilters, today.value))
const hasTaskFilters = computed(() => !!taskFilters.search.trim() || taskFilters.project !== 'all'
  || taskFilters.stage !== 'all' || taskFilters.deadline !== 'all' || taskFilters.showCompleted)
function resetTaskFilters() { Object.assign(taskFilters, defaultFilters) }
</script>

<template>
  <div class="task-filters">
    <UInput v-model="taskFilters.search" icon="i-lucide-search" placeholder="Найти задачу…" aria-label="Поиск задач"/>
    <USelect v-if="!projectId" :model-value="taskFilters.project" @update:model-value="value=>{taskFilters.project=value;taskFilters.stage='all'}" :items="projectOptions" aria-label="Проект задачи"/>
    <USelect v-model="taskFilters.stage" :items="stageOptions" aria-label="Стадия задачи"/>
    <USelect v-model="taskFilters.deadline" :items="[{label:'Любой срок',value:'all'},{label:'Просроченные',value:'overdue'},{label:'На сегодня',value:'today'},{label:'Ближайшие 7 дней',value:'week'},{label:'Без срока',value:'none'}]" aria-label="Срок задачи"/>
    <UCheckbox v-model="taskFilters.showCompleted" label="Показывать завершенные" class="self-center" />
    <UButton v-if="hasTaskFilters" label="Сбросить" icon="i-lucide-x" color="neutral" variant="ghost" @click="resetTaskFilters"/>
  </div>
  <p v-if="!loading" class="task-result-count" role="status">Найдено задач: {{tasks.length}}</p>
  <p v-if="loading">Загружаем задачи…</p>
  <slot />
  <div class="kaban-task-list">
    <NuxtLink v-for="row in tasks" :key="`${row.project.id}:${row.task.id}`" :to="{path:`/projects/${row.project.id}/tasks`,query:projectId ? { view: mode, task: row.task.id } : { task: row.task.id }}">
      <span class="task-dot" :style="{background:row.stage?.color||'#94a3b8'}"/>
      <div class="task-list-summary">
        <strong>{{ row.task.title }}</strong>
        <small>{{ projectId ? '' : row.project.name + ' · ' }}{{ row.stage?.name || 'Без стадии' }}</small>
      </div>
      <div class="task-list-deadline">
        <time v-if="row.task.dueOn" :datetime="row.task.dueOn">{{ dateLabel(row.task.dueOn) }}</time>
        <span v-else>Без срока</span>
        <KabanTaskDeadline :task="row.task" :today="today" :done="row.stage?.done" compact />
      </div>
      <UIcon name="i-lucide-arrow-up-right" class="task-list-arrow" aria-hidden="true"/>
    </NuxtLink>
    <p v-if="!tasks.length&&!loading">Задачи не найдены.</p>
  </div>
</template>

<style scoped>
.task-filters{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.task-filters>:first-child{flex:1;min-width:220px}.task-filters>:not(:first-child){min-width:160px}.task-result-count{font-size:12px;color:#94a3b8;margin:0 0 18px}@media(max-width:600px){.task-filters>*{width:100%;min-width:0!important}}
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
