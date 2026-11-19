<script setup lang="ts">
import ProjectTasksPlanner from '../Kaban/ProjectTasksPlanner.vue'
import type { Project } from '~~/shared/types/projects'
import { kabanCanEditPlanning, kabanTaskBody } from '~~/shared/utils/kaban'
import { kabanProjectPlanningStages, kabanTaskScope } from '~~/shared/utils/kaban-stages'
import type { KabanTask, KabanWorkspace } from '~~/shared/types/kaban'
import { clipTaskDateRange, shiftTaskPlanningPeriod, taskDateRange, taskPlanningDays } from '~~/shared/utils/project-task-planning'
import { dayDifference, todayDate } from '~~/shared/utils/subscriptions'

const props = defineProps<{
  mode: 'calendar' | 'gantt'
  project: Pick<Project, 'id' | 'name' | 'profile'>
  board?: KabanWorkspace
  loading: boolean
  failed: boolean
  refresh: () => Promise<unknown>
  portal?: HTMLElement
}>()
const auth = useAuthStore()
const today = todayDate()
const anchor = ref(today)
const days = computed(() => taskPlanningDays(anchor.value, 'month'))
const caption = computed(() => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(anchor.value + 'T12:00:00Z')))
const stages = computed(() => new Map(props.board?.board.stages.map(stage => [stage.id, stage])))
const timeline = computed(() => (props.board?.tasks ?? []).flatMap(task => {
  if (task.archived) return []
  const range = taskDateRange(task)
  const clipped = range && clipTaskDateRange(range, days.value[0]!, days.value.at(-1)!)
  if (!clipped) return []
  const column = dayDifference(days.value[0]!, clipped.start)
  return [{ task, column, length: dayDifference(clipped.start, clipped.end) + 1, color: stages.value.get(task.stageId)?.color ?? '#64748b' }]
}).sort((a, b) => a.column - b.column || a.task.title.localeCompare(b.task.title, 'ru')))
const calendar = computed(() => {
  const cells = days.value.map(day => ({ day, items: [] as typeof timeline.value }))
  for (const entry of timeline.value) {
    for (const cell of cells.slice(entry.column, entry.column + entry.length)) cell.items.push(entry)
  }
  return cells
})
const path = computed(() => `/projects/${props.project.id}/tasks`)
function shift(direction: number) {
  anchor.value = shiftTaskPlanningPeriod(anchor.value, 'month', direction)
}

const search = ref('')
const busy = ref(false)
const ganttStages = computed(() => props.board ? kabanProjectPlanningStages(props.board) : [])
const categories = computed(() => props.board?.categories.filter(category => !category.archived) ?? [])
const markerProjects = computed(() => [{
  id: props.project.id, name: props.project.name, canEdit: !!props.board?.canEdit
}])
const ganttTasks = computed(() => props.board?.tasks.filter(task => {
  if (task.archived) return false
  const blocks = task.blocks?.map(block => block.title + ('value' in block ? ' ' + block.value : '')).join(' ') ?? ''
  return `${task.title} ${task.description} ${blocks}`.toLowerCase().includes(search.value.trim().toLowerCase())
}) ?? [])

function categoryContains(id: string, ids: string[]) {
  return ids.includes(id) || categories.value.some(category => category.parentId === id && ids.includes(category.id))
}
function openTask(task: KabanTask, edit = false) {
  void navigateTo({ path: path.value, query: { view: 'gantt', task: task.id, ...(edit ? { editTask: '1' } : {}) } })
}
function canReschedule(task: KabanTask) {
  return task.canEdit && !task.archived && kabanCanEditPlanning(auth.user?.id, task)
}
async function reschedule(task: KabanTask, startOn: string, dueOn: string) {
  if (busy.value || !canReschedule(task)) throw new Error('Даты задачи недоступны для редактирования.')
  busy.value = true
  try {
    const scope = kabanTaskScope(props.board, task.categoryIds)
    await sharedRequest(`/api/kaban/tasks/${task.id}`, { method: 'PUT', body: kabanTaskBody({ ...task, startOn, dueOn }, scope) })
  } catch (failure: unknown) {
    const error = failure as { data?: { message?: string }; message?: string }
    throw new Error(error.data?.message || error.message || 'Не удалось изменить даты задачи.')
  } finally {
    try { await props.refresh() } finally { busy.value = false }
  }
}
</script>

<template>
  <section class="space-plan" :aria-label="mode === 'calendar' ? 'Календарь задач проекта' : 'Диаграмма Ганта проекта'">
    <div class="plan-title">
      <UIcon :name="mode === 'calendar' ? 'i-lucide-calendar-days' : 'i-lucide-chart-gantt'" />
      <h3>{{ mode === 'calendar' ? 'Календарь задач' : 'Диаграмма Ганта' }}</h3>
      <NuxtLink :to="{ path, query: { view: mode } }" @pointerdown.stop>Открыть <UIcon name="i-lucide-arrow-up-right" /></NuxtLink>
    </div>
    <p v-if="loading && !board" class="plan-empty">Загружаем задачи…</p>
    <p v-else-if="failed && !board" class="plan-empty">Не удалось загрузить задачи проекта.</p>
    <div v-else-if="board && mode === 'gantt'" class="space-gantt" @pointerdown.stop @keydown.stop @wheel.stop>
      <UInput v-model="search" icon="i-lucide-search" placeholder="Найти задачу…" aria-label="Поиск задач" class="w-full max-w-md" />
      <ProjectTasksPlanner mode="gantt" embedded :portal="portal"
        :project-start-on="project.profile?.startOn" :project-end-on="project.profile?.endOn"
        :marker-projects="markerProjects" :tasks="ganttTasks" :stages="ganttStages" :categories="categories" :people="board.people"
        :category-contains="categoryContains" :can-create="false" :can-reschedule="canReschedule" :reschedule="reschedule" :busy="busy"
        @open="openTask" />
    </div>
    <template v-else-if="board">
      <div class="plan-period" @pointerdown.stop>
        <button type="button" aria-label="Предыдущий период" @click="shift(-1)"><UIcon name="i-lucide-chevron-left" /></button>
        <strong>{{ caption }}</strong>
        <button type="button" aria-label="Следующий период" @click="shift(1)"><UIcon name="i-lucide-chevron-right" /></button>
      </div>
      <div class="plan-calendar">
        <div v-for="label in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="label" class="plan-day-label">{{ label }}</div>
        <div v-for="cell in calendar" :key="cell.day" class="plan-cell" :class="{ muted: !cell.day.startsWith(anchor.slice(0, 7)), today: cell.day === today }">
          <time :datetime="cell.day">{{ Number(cell.day.slice(-2)) }}</time>
          <NuxtLink v-for="{ task, color } in cell.items.slice(0, 2)" :key="task.id" :to="{ path, query: { task: task.id } }"
            class="plan-task" :style="{ '--task-color': color }" :title="task.title" @pointerdown.stop>{{ task.title }}</NuxtLink>
          <NuxtLink v-if="cell.items.length > 2" :to="{ path, query: { view: mode } }" class="plan-more" @pointerdown.stop>Ещё {{ cell.items.length - 2 }}</NuxtLink>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.space-plan{font-size:13px;color:#334155}
.plan-title,.plan-period{display:flex;align-items:center;gap:9px}
.plan-title>.iconify{color:#7c3aed;font-size:19px}
.plan-title h3{font-weight:700}
.plan-title a{margin-left:auto;display:flex;align-items:center;gap:3px;color:#6d28d9;font-size:11px}
.plan-period{justify-content:space-between;margin:10px 0 6px}
.plan-period strong::first-letter{text-transform:uppercase}
.plan-period button{display:grid;place-items:center;padding:4px;border-radius:5px}
.plan-period button:hover{background:#ede9fe}
.plan-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.plan-day-label{text-align:center;font-size:10px;color:#64748b}
.plan-cell{min-width:0;display:grid;align-content:start;gap:2px;min-height:46px;padding:3px;border-radius:5px;background:#f1f5f9;font-size:10px}
.plan-cell.muted{background:#f8fafc;color:#94a3b8}.plan-cell.today{outline:1px solid #8b5cf6}
.plan-task{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plan-task{padding:1px 3px;border-radius:3px;background:color-mix(in srgb,var(--task-color) 20%,white);color:#1e293b}
.plan-task:hover,.plan-title a:hover,.plan-more:hover{text-decoration:underline}
.plan-more{display:block;padding:3px;color:#6d28d9;font-size:10px}
.space-gantt{display:grid;gap:16px;min-width:0;margin-top:14px;cursor:default}
.plan-empty{margin-top:7px;padding:5px;color:#64748b;font-size:11px}
</style>
