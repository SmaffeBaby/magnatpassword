<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { KabanCategory, KabanStage, KabanTask } from '~~/shared/types/kaban'
import type { TeamPerson } from '~~/shared/types/team'
import { kabanOverdue } from '~~/shared/utils/kaban'
import { kabanTaskStage } from '~~/shared/utils/kaban-stages'
import { clipTaskDateRange, compareGanttTasks, resizeTaskDateRange, shiftTaskPlanningPeriod, taskDateRange, taskPlanningDays, type GanttMarker, type GanttMarkerProject, type GanttTaskSort, type PlanningProjectBoard, type TaskDateEdge, type TaskDateRange, type TaskPeriod } from '~~/shared/utils/project-task-planning'
import { addPeriod, dateLabel, dayDifference, todayDate, validDate } from '~~/shared/utils/subscriptions'
import GanttMarkers from './GanttMarkers.vue'

const props = defineProps<{
  mode: 'calendar' | 'gantt'
  filterScope: string
  embedded?: boolean
  portal?: HTMLElement
  projectStartOn?: string
  projectEndOn?: string
  projectBoards?: PlanningProjectBoard[]
  markerProjects?: GanttMarkerProject[]
  tasks: KabanTask[]
  stages: (KabanStage & { boardId?: string })[]
  categories: KabanCategory[]
  people: TeamPerson[]
  categoryContains: (id: string, ids: string[], boardId: string) => boolean
  canCreate: boolean
  canReschedule: (task: KabanTask) => boolean
  reschedule: (task: KabanTask, startOn: string, dueOn: string) => Promise<void>
  busy: boolean
}>()
const emit = defineEmits<{ open: [task: KabanTask, edit?: boolean]; create: [dueOn: string] }>()
const canEditTask = (task: KabanTask) => task.canEdit && !task.archived

const today = todayDate()
const {anchor, calendarPeriod, ganttPeriod, categories, assignees, stages, deadline, ganttSort} = toRefs(useSavedFilters(
  () => `task-planner:${props.filterScope}:${props.mode}`,
  {anchor:today, calendarPeriod:'month' as TaskPeriod, ganttPeriod:'4' as TaskPeriod, categories:[] as string[], assignees:[] as string[], stages:[] as string[], deadline:'all', ganttSort:'start-asc' as GanttTaskSort}
))
const period = computed({ get: () => props.mode === 'calendar' ? calendarPeriod.value : ganttPeriod.value, set: (value: TaskPeriod) => {
  if (props.mode === 'calendar') calendarPeriod.value = value
  else ganttPeriod.value = value
} })
const periodOptions = [
  { value: 'month', label: 'Месяц' }, { value: '1', label: 'Неделя' },
  { value: '2', label: '2 недели' }, { value: '3', label: '3 недели' },
  { value: '4', label: '4 недели' }, { value: '8', label: '8 недель' }
] as const
const options = computed(() => periodOptions.filter(item => props.mode === 'calendar' ? item.value !== '8' : ['2', '4', '8'].includes(item.value)))
const days = computed(() => taskPlanningDays(anchor.value, period.value))
const first = computed(() => days.value[0] ?? anchor.value)
const last = computed(() => days.value.at(-1) ?? anchor.value)
const auth = useAuthStore()
const client = useQueryClient()
const markerKey = computed(() => ['account', auth.user?.id, 'kaban-gantt-markers'] as const)
const markerQuery = useQuery({
  queryKey: markerKey,
  enabled: computed(() => !!auth.user && props.mode === 'gantt' && !!props.markerProjects?.length),
  queryFn: ({ signal }) => sharedRequest<GanttMarker[]>('/api/kaban/markers', { signal }),
  refetchInterval: 30_000,
  retry: false
})
const markers = computed(() => {
  const projects = new Set(props.markerProjects?.map(project => project.id))
  return (markerQuery.data.value ?? []).filter(marker => projects.has(marker.projectId))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))
})
const markersByDay = computed(() => {
  const byDay = new Map<string, GanttMarker[]>()
  for (const marker of markers.value) {
    const group = byDay.get(marker.day) ?? []
    group.push(marker)
    byDay.set(marker.day, group)
  }
  return byDay
})
const markerLines = computed(() => days.value.flatMap((day, column) => {
  const group = markersByDay.value.get(day) ?? []
  return group.map((marker, index) => ({
    ...marker, left: `${(column + (index + 1) / (group.length + 1)) / days.value.length * 100}%`
  }))
}))
async function markerChanged(marker: GanttMarker, deleted: boolean) {
  const key = markerKey.value
  await client.cancelQueries({ queryKey: key, exact: true })
  if (key[1] !== auth.user?.id) return
  client.setQueryData<GanttMarker[]>(key, (current = []) => [
    ...current.filter(item => item.id !== marker.id), ...(deleted ? [] : [marker])
  ])
  void client.invalidateQueries({ queryKey: key, exact: true })
}
const singleProject = computed(() => props.projectBoards ? (props.projectBoards.length === 1 ? props.projectBoards[0] : undefined) : { startOn: props.projectStartOn, endOn: props.projectEndOn })
const projectDates = computed(() => [
  { kind: 'start', label: 'Начало проекта', date: singleProject.value?.startOn },
  { kind: 'end', label: 'Окончание проекта', date: singleProject.value?.endOn }
] as const)
const projectNames = computed(() => new Map(props.projectBoards?.map(project => [project.boardId, project.name])))
const taskKey = (task: KabanTask) => `${task.boardId}:${task.id}`
const projectName = (task: KabanTask) => projectNames.value.get(task.boardId)
const taskLabel = (task: KabanTask) => [task.title, projectName(task)].filter(Boolean).join(' · ')
const projectRows = computed(() => (props.projectBoards ?? [{ boardId: '', name: 'Период проекта', ...singleProject.value }]).flatMap(project => {
  const start = project.startOn || project.endOn
  const end = project.endOn || project.startOn
  if (!start || !end || !validDate(start) || !validDate(end) || start > end) return []
  const label = [project.startOn, project.endOn].filter((value): value is string => !!value).map(dateLabel).join(' — ')
  return [{ ...project, start, end, label, position: timelinePosition({ start, end }) }]
}))
function timelinePosition(range: TaskDateRange) {
  const clipped = clipTaskDateRange(range, first.value, last.value)
  if (!clipped) return null
  const column = dayDifference(first.value, clipped.start)
  const length = dayDifference(clipped.start, clipped.end) + 1
  return { column, length, gridColumn: `${column + 1} / span ${length}` }
}
function ganttDayLabel(day: string) {
  return [dateLabel(day), ...projectDates.value.filter(item => item.date === day).map(item => item.label), ...(markersByDay.value.get(day) ?? []).map(marker => marker.title)].join(' · ')
}
const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const monthFormat = new Intl.DateTimeFormat('ru-RU', { year: 'numeric', month: 'long', timeZone: 'UTC' })
const shortFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dateAt = (date: string) => new Date(date + 'T12:00:00Z')
const periodLabel = computed(() => period.value === 'month'
  ? monthFormat.format(dateAt(anchor.value))
  : `${shortFormat.format(dateAt(first.value))} — ${dateLabel(last.value)}`)
const scopedKey = (id: string, boardId?: string) => props.projectBoards && boardId ? `${boardId}:${id}` : id
const stageById = computed(() => new Map(props.stages.map(stage => [scopedKey(stage.id, stage.boardId), stage])))
const stage = (task: KabanTask, categoryId?: string) => stageById.value.get(scopedKey(kabanTaskStage(task, categoryId), task.boardId))
const unassigned = 'unassigned'
const categoryOptions = computed(() => {
  const names = new Map(props.categories.map(category => [scopedKey(category.id, category.boardId), category.name]))
  return props.categories.map(category => {
    const parent = category.parentId ? names.get(scopedKey(category.parentId, category.boardId)) : undefined
    const project = category.boardId ? projectNames.value.get(category.boardId) : undefined
    return { label: [project, parent, category.name].filter(Boolean).join(' / '), value: scopedKey(category.id, category.boardId) }
  }).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
})
const assigneeOptions = computed(() => [
  { label: 'Без исполнителя', value: unassigned },
  ...props.people.map(person => ({ label: person.fullName || person.email, value: person.id })).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
])
const stageOptions = computed(() => [...new Set(props.stages.map(stage => stage.name))].map(name => ({ label: name, value: name })))
const stageLegend = computed(() => [...new Map(props.stages.map(stage => [JSON.stringify([stage.name, stage.color]), stage])).values()])
watch([categoryOptions, assigneeOptions, stageOptions], ([availableCategories, availablePeople, availableStages]) => {
  if (!props.projectBoards) return
  categories.value = categories.value.filter(id => availableCategories.some(option => option.value === id))
  assignees.value = assignees.value.filter(id => availablePeople.some(option => option.value === id))
  stages.value = stages.value.filter(name => availableStages.some(option => option.value === name))
})
const deadlineOptions = [
  { label: 'Любой срок', value: 'all' }, { label: 'Просроченные', value: 'overdue' },
  { label: 'Срок сегодня', value: 'today' }, { label: 'Без срока', value: 'none' }
]
const sortOptions: { label: string; value: GanttTaskSort }[] = [
  { label: 'По началу · сначала ранние', value: 'start-asc' },
  { label: 'По началу · сначала поздние', value: 'start-desc' },
  { label: 'Сначала ближайший срок', value: 'due-asc' },
  { label: 'Сначала самый поздний срок', value: 'due-desc' },
  { label: 'Название от А до Я', value: 'title-asc' },
  { label: 'Название от Я до А', value: 'title-desc' }
]
const hasFilters = computed(() => categories.value.length || assignees.value.length || stages.value.length || deadline.value !== 'all')
function resetFilters() {
  categories.value = []; assignees.value = []; stages.value = []; deadline.value = 'all'
}
const filteredStages = computed(() => {
  const matches = new Map<string, KabanStage | undefined>()
  for (const task of props.tasks) {
    const categoryIds = categories.value.length ? task.categoryIds.filter(id => categories.value.some(selected => props.categoryContains(selected, [id], task.boardId))) : []
    if (categories.value.length && !categoryIds.length) continue
    if (assignees.value.length && !assignees.value.some(id => id === unassigned ? !task.participantIds.length : task.participantIds.includes(id))) continue
    const candidates = categoryIds.length ? categoryIds.map(id => stage(task, id)) : [stage(task)]
    const matchesStage = (candidate?: KabanStage) => !stages.value.length || (!!candidate && stages.value.includes(candidate.name))
    const matchesDeadline = (candidate?: KabanStage) => {
      if (deadline.value === 'overdue') return kabanOverdue(task, candidate?.done, today)
      if (deadline.value === 'today') return task.dueOn === today
      if (deadline.value === 'none') return !task.dueOn
      return true
    }
    const matched = candidates.findIndex(candidate => matchesStage(candidate) && matchesDeadline(candidate))
    if (matched !== -1) matches.set(taskKey(task), candidates[matched])
  }
  return matches
})
const rangeGroups = computed(() => {
  const scheduled: { task: KabanTask; start: string; end: string; column: number; length: number; gridColumn: string }[] = []
  const unscheduled: KabanTask[] = []
  const outside: { task: KabanTask; start: string; end: string }[] = []
  const tasks = props.tasks.filter(task => filteredStages.value.has(taskKey(task)))
  if (props.mode === 'gantt') tasks.sort((a, b) => compareGanttTasks(a, b, ganttSort.value))
  for (const task of tasks) {
    const range = taskDateRange(task)
    if (!range) { unscheduled.push(task); continue }
    const position = timelinePosition(range)
    if (!position) { outside.push({ task, ...range }); continue }
    scheduled.push({ task, ...range, ...position })
  }
  if (props.mode === 'calendar') {
    scheduled.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.task.title.localeCompare(b.task.title, 'ru'))
    outside.sort((a, b) => a.start.localeCompare(b.start))
  }
  return { scheduled, unscheduled, outside }
})
const calendar = computed(() => {
  const cells = days.value.map(date => ({ date, tasks: [] as KabanTask[] }))
  for (const { task, column, length } of rangeGroups.value.scheduled) {
    for (const cell of cells.slice(column, column + length)) cell.tasks.push(task)
  }
  return cells
})
const selectedDay = ref('')
const dayTasks = computed(() => calendar.value.find(cell => cell.date === selectedDay.value)?.tasks ?? [])
function shift(direction: number) {
  anchor.value = shiftTaskPlanningPeriod(anchor.value, period.value, direction)
}
function jumpTo(date: unknown) {
  if (typeof date === 'string' && validDate(date)) anchor.value = date
}
const ganttScroll = ref<HTMLElement | null>(null)
const markerOverlay = ref<HTMLElement | null>(null)
const markerTooltip = ref<{ title: string; date: string; x: number; y: number; above: boolean } | null>(null)
function hideMarkerTooltip() {
  markerTooltip.value = null
}
function hoverMarker(event: PointerEvent) {
  const overlay = markerOverlay.value
  if (!overlay || event.buttons || resize.value || event.pointerType === 'touch') return hideMarkerTooltip()
  const track = overlay.getBoundingClientRect()
  const sticky = ganttScroll.value?.querySelector('.gantt-name')?.getBoundingClientRect()
  if (event.clientY < track.top || event.clientY >= track.bottom || event.clientX < (sticky?.right ?? track.left)) return hideMarkerTooltip()
  const relativeX = event.clientX - track.left
  const hit = markerLines.value.reduce<{ marker: typeof markerLines.value[number]; distance: number } | null>((closest, marker) => {
    const distance = Math.abs(relativeX - Number.parseFloat(marker.left) * track.width / 100)
    return distance <= 5 && (!closest || distance < closest.distance) ? { marker, distance } : closest
  }, null)
  if (!hit) return hideMarkerTooltip()
  const above = event.clientY > window.innerHeight - 90
  markerTooltip.value = {
    title: hit.marker.title,
    date: hit.marker.day,
    x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 248)),
    y: event.clientY + (above ? -12 : 12),
    above
  }
}
async function showProjectDate(date: string) {
  jumpTo(date)
  await nextTick()
  const container = ganttScroll.value
  const day = container?.querySelector<HTMLElement>(`[data-gantt-day="${date}"]`)
  if (!container || !day) return
  const nameWidth = container.querySelector('.gantt-name')?.getBoundingClientRect().width ?? 0
  const viewport = container.getBoundingClientRect()
  const scale = viewport.width / container.offsetWidth || 1
  const bounds = day.getBoundingClientRect()
  const position = bounds.left + bounds.width / 2 - viewport.left
  container.scrollLeft += (position - (viewport.width + nameWidth) / 2) / scale
}

const editing = ref<KabanTask | null>(null)
const dates = reactive({ startOn: '', dueOn: '' })
const dateError = ref('')
const dateForm = useId()
type ResizeState = {
  task: KabanTask; edge: TaskDateEdge; pointerId: number | null; track: HTMLElement;
  offset: number; original: TaskDateRange; preview: TaskDateRange;
}
const resize = shallowRef<ResizeState | null>(null)
const resizingTask = computed(() => resize.value ? taskKey(resize.value.task) : '')
const resizeError = ref('')
const resizePreview = computed(() => resize.value && timelinePosition(resize.value.preview))
const resizeLabel = computed(() => resize.value && `${dateLabel(resize.value.preview.start)} — ${dateLabel(resize.value.preview.end)}`)
function beginResize(event: PointerEvent, task: KabanTask, edge: TaskDateEdge) {
  if (event.button !== 0 || !event.isPrimary || resize.value || props.busy || !props.canReschedule(task)) return
  const original = taskDateRange(task)
  const track = (event.currentTarget as HTMLElement).closest<HTMLElement>('.gantt-track')
  if (!original || !track) return
  track.setPointerCapture(event.pointerId)
  resizeError.value = ''
  resize.value = { task, edge, pointerId: event.pointerId, track, offset: event.clientX - track.getBoundingClientRect().left, original, preview: original }
}
function moveResize(event: PointerEvent) {
  const active = resize.value
  if (!active || active.pointerId !== event.pointerId) return
  const track = active.track.getBoundingClientRect()
  if (!track.width) return
  const delta = Math.round((event.clientX - track.left - active.offset) * days.value.length / track.width)
  const originalDate = active.original[active.edge]
  const column = Math.min(days.value.length - 1, Math.max(0, dayDifference(first.value, originalDate) + delta))
  const date = addPeriod(first.value, column, 'day')
  const preview = resizeTaskDateRange(active.original, active.edge, date)
  if (preview[active.edge] !== active.preview[active.edge]) resize.value = { ...active, preview }
}
function cancelResize(event?: PointerEvent) {
  const active = resize.value
  if (!active || active.pointerId === null || (event && event.pointerId !== active.pointerId)) return
  resize.value = null
  if (active.track.hasPointerCapture(active.pointerId)) active.track.releasePointerCapture(active.pointerId)
}
async function finishResize(event: PointerEvent) {
  const active = resize.value
  if (!active || active.pointerId !== event.pointerId) return
  moveResize(event)
  const { task, edge, original, preview } = resize.value!
  if (preview[edge] === original[edge] || props.busy || !props.canReschedule(task)) { cancelResize(event); return }
  resize.value = { ...active, preview, pointerId: null }
  try { await props.reschedule(task, preview.start, preview.end) }
  catch (failure) { resizeError.value = failure instanceof Error ? failure.message : 'Не удалось изменить даты задачи.' }
  finally { resize.value = null }
}
watch([first, last, ganttSort, () => props.mode], () => { cancelResize(); hideMarkerTooltip() })
watch(markers, hideMarkerTooltip)
watch(filteredStages, matches => { if (resize.value && !matches.has(resizingTask.value)) cancelResize() })
function edit(task: KabanTask) {
  if (props.busy || !props.canReschedule(task)) return
  editing.value = task
  Object.assign(dates, { startOn: task.startOn || '', dueOn: task.dueOn })
  dateError.value = ''
}
async function saveDates() {
  if (!editing.value || props.busy) return
  dateError.value = ''
  try {
    await props.reschedule(editing.value, dates.startOn, dates.dueOn)
    const range = taskDateRange(dates)
    if (range && !clipTaskDateRange(range, first.value, last.value)) anchor.value = range.start
    editing.value = null
  } catch (failure) {
    dateError.value = failure instanceof Error ? failure.message : 'Не удалось изменить даты задачи.'
  }
}
</script>

<template>
  <section class="task-planner" :class="{ embedded }" :aria-label="mode === 'calendar' ? 'Календарь задач' : 'Диаграмма Ганта'">
    <header class="planner-toolbar">
      <div class="flex flex-wrap items-center gap-2">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" aria-label="Предыдущий период" @click="shift(-1)" />
        <UButton label="Сегодня" color="neutral" variant="outline" @click="anchor = today" />
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" aria-label="Следующий период" @click="shift(1)" />
        <h2 aria-live="polite">{{ periodLabel }}</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <SharedDatePicker :model-value="anchor" :clearable="false" aria-label="Перейти к дате" class="w-36" @update:model-value="jumpTo" />
        <USelect :portal="portal ?? true" v-model="period" :items="options" aria-label="Масштаб периода" />
      </div>
    </header>

    <div class="task-filters" :class="{ 'gantt-filters': mode === 'gantt' }" role="group" :aria-label="mode === 'gantt' ? 'Фильтры и сортировка диаграммы Ганта' : 'Фильтры календаря задач'">
      <USelectMenu :portal="portal ?? true" v-model="categories" :items="categoryOptions" value-key="value" multiple placeholder="Все категории" aria-label="Категории" class="min-w-0 w-full" />
      <USelectMenu :portal="portal ?? true" v-model="assignees" :items="assigneeOptions" value-key="value" multiple placeholder="Все исполнители" aria-label="Исполнители" class="min-w-0 w-full" />
      <USelectMenu :portal="portal ?? true" v-model="stages" :items="stageOptions" value-key="value" multiple placeholder="Все стадии" aria-label="Стадии" class="min-w-0 w-full" />
      <USelect :portal="portal ?? true" v-model="deadline" :items="deadlineOptions" aria-label="Срок задачи" class="min-w-0 w-full" />
      <USelect v-if="mode === 'gantt'" v-model="ganttSort" :items="sortOptions" icon="i-lucide-arrow-down-up" aria-label="Сортировка задач" class="min-w-0 w-full" />
      <UButton v-if="hasFilters" type="button" label="Сбросить фильтры" icon="i-lucide-x" color="neutral" variant="ghost" @click="resetFilters" />
    </div>
    <p v-if="hasFilters && !filteredStages.size" class="filter-empty" role="status">По выбранным фильтрам задач нет.</p>
    <UAlert v-if="mode === 'gantt' && resizeError" color="error" :description="resizeError" />

    <dl v-if="mode === 'gantt' && singleProject" class="gantt-project-dates" aria-label="Даты проекта">
      <div v-for="item in projectDates" :key="item.kind">
        <dt :class="item.kind">{{ item.label }}</dt>
        <dd>
          <button v-if="item.date && validDate(item.date)" type="button" :aria-label="`Показать на шкале: ${item.label}, ${dateLabel(item.date)}`" @click="showProjectDate(item.date)">
            <time :datetime="item.date">{{ dateLabel(item.date) }}</time>
          </button>
          <span v-else>Не указано</span>
        </dd>
      </div>
    </dl>

    <template v-if="mode === 'gantt' && markerProjects?.length">
      <UAlert v-if="markerQuery.error.value" color="error" title="Не удалось загрузить маркеры" :actions="[{ label: 'Повторить', onClick: () => markerQuery.refetch() }]" />
      <GanttMarkers :portal="portal" :projects="markerProjects" :markers="markers" :anchor="anchor" @jump="showProjectDate" @changed="markerChanged" />
    </template>
    <div v-if="mode === 'gantt' && stageLegend.length" class="gantt-legend">
      <h3>Цвета стадий</h3>
      <ul>
        <li v-for="stage in stageLegend" :key="JSON.stringify([stage.name, stage.color])">
          <span :style="{ '--stage': stage.color }" aria-hidden="true" />{{ stage.name }}
        </li>
      </ul>
    </div>

    <div v-if="mode === 'calendar'" class="planner-scroll" tabindex="0" aria-label="Дни календаря">
      <div class="planner-calendar">
        <div v-for="day in weekDays" :key="day" class="calendar-weekday">{{ day }}</div>
        <article v-for="cell in calendar" :key="cell.date" class="calendar-cell" :class="{muted: period === 'month' && cell.date.slice(0, 7) !== anchor.slice(0, 7), today: cell.date === today}" :aria-label="dateLabel(cell.date)">
          <header>
            <span :aria-current="cell.date === today ? 'date' : undefined">{{ Number(cell.date.slice(-2)) }}</span>
            <UButton v-if="canCreate" color="neutral" variant="ghost" size="xs" icon="i-lucide-plus" :aria-label="`Добавить задачу на ${dateLabel(cell.date)}`" :disabled="busy" @click="emit('create', cell.date)" />
          </header>
          <button v-for="task in cell.tasks.slice(0, 3)" :key="taskKey(task)" type="button" class="calendar-task" :class="{done: filteredStages.get(taskKey(task))?.done}" :title="taskLabel(task)" @click="emit('open', task)">
            <span class="task-dot" :style="{background: filteredStages.get(taskKey(task))?.color}" />
            <span class="calendar-task-text"><span>{{ task.title }}</span><small v-if="projectName(task)">{{ projectName(task) }}</small></span>
          </button>
          <button v-if="cell.tasks.length > 3" type="button" class="calendar-more" @click="selectedDay = cell.date">Ещё {{ cell.tasks.length - 3 }}</button>
        </article>
      </div>
    </div>

    <div v-else ref="ganttScroll" class="planner-scroll" tabindex="0" aria-label="Шкала диаграммы Ганта" @pointermove="hoverMarker" @pointerleave="hideMarkerTooltip" @pointerdown="hideMarkerTooltip" @scroll="hideMarkerTooltip">
      <div class="gantt" :style="{ '--days': days.length }">
        <div class="gantt-row gantt-header">
          <div class="gantt-name">Задача</div>
          <div class="gantt-track">
            <span v-for="day in days" :key="day" :data-gantt-day="day" :class="{today: day === today, 'project-start': day === singleProject?.startOn, 'project-end': day === singleProject?.endOn}" :title="ganttDayLabel(day)" :aria-current="day === today ? 'date' : undefined">{{ Number(day.slice(-2)) }}<small v-if="day === first || day.endsWith('-01')"> {{ shortFormat.format(dateAt(day)).replace(/^\d+\s*/, '') }}</small></span>
          </div>
        </div>
        <div v-for="project in projectRows" :key="project.boardId" class="gantt-row gantt-project-row">
          <div class="gantt-name" :title="project.name"><span>{{ project.name }}</span></div>
          <div class="gantt-track">
            <div v-if="project.position" class="gantt-project-bar" :class="{ 'continues-left': project.start < first, 'continues-right': project.end > last, milestone: !project.startOn || !project.endOn }" :style="{ gridColumn: project.position.gridColumn }" :title="project.label">
              <span v-if="project.startOn && project.endOn">{{ project.label }}</span>
              <span v-else class="sr-only">{{ project.label }}</span>
            </div>
            <button v-else type="button" class="gantt-project-outside" :title="project.label" @click="showProjectDate(project.start)">{{ project.label }} · Показать на шкале</button>
          </div>
        </div>
        <div v-for="{ task, start, end, gridColumn } in rangeGroups.scheduled" :key="taskKey(task)" class="gantt-row">
          <div class="gantt-name">
            <button type="button" :title="taskLabel(task)" @click="emit('open', task)"><span>{{ task.title }}</span><small v-if="projectName(task)" class="task-project-name">{{ projectName(task) }}</small></button>
            <div v-if="canEditTask(task)" class="gantt-task-actions">
              <UButton v-if="canReschedule(task)" icon="i-lucide-calendar-days" size="xs" color="neutral" variant="ghost" :aria-label="`Изменить даты: ${task.title}`" title="Изменить даты" :disabled="busy" @click="edit(task)" />
              <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" :aria-label="`Редактировать задачу: ${task.title}`" title="Редактировать задачу" :disabled="busy" @click="emit('open', task, true)" />
            </div>
          </div>
          <div class="gantt-track" @pointermove="moveResize" @pointerup="finishResize" @pointercancel="cancelResize" @lostpointercapture="cancelResize">
            <div class="gantt-bar" :class="{done: filteredStages.get(taskKey(task))?.done, resizing: resizingTask === taskKey(task)}" :style="{ gridColumn: resizingTask === taskKey(task) ? resizePreview?.gridColumn ?? gridColumn : gridColumn, '--stage': filteredStages.get(taskKey(task))?.color }">
              <button type="button" class="gantt-bar-label" :title="`${taskLabel(task)} · ${dateLabel(start)} — ${dateLabel(end)}`" :aria-label="`Открыть задачу: ${taskLabel(task)}, ${dateLabel(start)} — ${dateLabel(end)}`" @click="emit('open', task)">
                {{ resizingTask === taskKey(task) ? resizeLabel : task.title }}
              </button>
              <template v-if="canReschedule(task)">
                <button v-if="start >= first" type="button" class="gantt-edge gantt-edge-start" :aria-label="`Перетащить начало: ${task.title}`" title="Перетащить начало" :disabled="busy" @pointerdown.prevent.stop="beginResize($event, task, 'start')" @click="event => { if (event.detail === 0) edit(task) }" />
                <button v-if="end <= last" type="button" class="gantt-edge gantt-edge-end" :aria-label="`Перетащить срок: ${task.title}`" title="Перетащить срок" :disabled="busy" @pointerdown.prevent.stop="beginResize($event, task, 'end')" @click="event => { if (event.detail === 0) edit(task) }" />
              </template>
            </div>
          </div>
        </div>
        <p v-if="!rangeGroups.scheduled.length && (!hasFilters || filteredStages.size)" class="planner-empty">На выбранный период нет задач с датами.</p>
        <div v-if="markerLines.length" ref="markerOverlay" class="gantt-marker-overlay" aria-hidden="true">
          <span v-for="marker in markerLines" :key="marker.id" class="gantt-marker-line" :style="{ left: marker.left, borderColor: marker.color }" />
        </div>
      </div>
    </div>
    <Teleport :to="portal ?? 'body'">
      <div v-if="markerTooltip" class="gantt-marker-tooltip" aria-hidden="true" :class="{ 'above-pointer': markerTooltip.above }" :style="{ left: `${markerTooltip.x}px`, top: `${markerTooltip.y}px` }">
        <strong>{{ markerTooltip.title }}</strong>
        <time :datetime="markerTooltip.date">{{ dateLabel(markerTooltip.date) }}</time>
      </div>
    </Teleport>

    <section v-if="rangeGroups.unscheduled.length" class="planner-list">
      <h3>Задачи без дат <small>{{ rangeGroups.unscheduled.length }}</small></h3>
      <ul>
        <li v-for="task in rangeGroups.unscheduled" :key="taskKey(task)">
          <button type="button" @click="emit('open', task)"><span>{{ task.title }}</span><small v-if="projectName(task)" class="task-project-name">{{ projectName(task) }}</small></button>
          <div v-if="mode === 'gantt' && canEditTask(task)" class="gantt-task-actions">
            <UButton v-if="canReschedule(task)" label="Назначить даты" size="xs" color="neutral" variant="outline" :disabled="busy" @click="edit(task)" />
            <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" :aria-label="`Редактировать задачу: ${task.title}`" title="Редактировать задачу" :disabled="busy" @click="emit('open', task, true)" />
          </div>
        </li>
      </ul>
    </section>
    <details v-if="rangeGroups.outside.length" class="planner-list">
      <summary>Задачи за пределами периода <small>{{ rangeGroups.outside.length }}</small></summary>
      <ul>
        <li v-for="{ task, start } in rangeGroups.outside" :key="taskKey(task)">
          <button type="button" @click="emit('open', task)"><span>{{ task.title }}</span><small v-if="projectName(task)" class="task-project-name">{{ projectName(task) }}</small></button>
          <div class="gantt-task-actions">
            <UButton :label="dateLabel(start)" icon="i-lucide-calendar-days" size="xs" color="neutral" variant="ghost" @click="anchor = start" />
            <UButton v-if="mode === 'gantt' && canEditTask(task)" icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" :aria-label="`Редактировать задачу: ${task.title}`" title="Редактировать задачу" :disabled="busy" @click="emit('open', task, true)" />
          </div>
        </li>
      </ul>
    </details>

    <UModal :portal="portal ?? true" :ui="portal ? { overlay: 'z-[150]', content: 'z-[151]' } : undefined" :open="!!selectedDay" :title="dateLabel(selectedDay)" description="Задачи на выбранный день" @update:open="value => { if (!value) selectedDay = '' }">
      <template #body><ul class="planner-day-list"><li v-for="task in dayTasks" :key="taskKey(task)"><UButton :label="taskLabel(task)" color="neutral" variant="ghost" @click="selectedDay = ''; emit('open', task)" /></li></ul></template>
      <template v-if="canCreate" #footer><UButton label="Добавить задачу" icon="i-lucide-plus" :disabled="busy" @click="emit('create', selectedDay); selectedDay = ''" /></template>
    </UModal>
    <UModal :portal="portal ?? true" :ui="portal ? { overlay: 'z-[150]', content: 'z-[151]' } : undefined" :open="!!editing" title="Даты задачи" :description="editing?.title" :dismissible="!busy" @update:open="value => { if (!value && !busy) editing = null }">
      <template #body>
        <form :id="dateForm" class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveDates">
          <UFormField label="Дата начала"><SharedDatePicker v-model="dates.startOn" :max="dates.dueOn || undefined" class="w-full" :disabled="busy" /></UFormField>
          <UFormField label="Срок задачи"><SharedDatePicker v-model="dates.dueOn" :min="dates.startOn || undefined" class="w-full" :disabled="busy" /></UFormField>
          <UAlert v-if="dateError" color="error" :description="dateError" class="sm:col-span-2" />
        </form>
      </template>
      <template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="editing = null" /><UButton type="submit" :form="dateForm" label="Сохранить даты" :loading="busy" /></template>
    </UModal>
  </section>
</template>

<style scoped>
.task-planner{display:grid;gap:16px;min-width:0;color:#334155}
.task-planner.embedded{container-type:inline-size}
@container (max-width: 780px){
  .embedded .gantt{--day-min:16px;--name-width:8rem}
  .embedded .gantt-filters{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@container (max-width: 420px){.embedded .gantt-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
.planner-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.planner-toolbar h2{margin-inline:4px;font-size:15px;font-weight:650}.planner-toolbar h2::first-letter{text-transform:uppercase}
.task-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;align-items:center;gap:8px}.gantt-filters{grid-template-columns:repeat(4,minmax(0,1fr)) minmax(12rem,1.35fr) auto}.filter-empty{margin:0;font-size:13px;color:#64748b}
.planner-scroll{overflow:auto;max-width:100%;border:1px solid #e2e8f0;border-radius:14px;background:#fff}
.planner-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-width:620px;background:#edf1f5;gap:1px}
.calendar-weekday{background:#f8fafc;padding:9px 12px;font-size:12px;font-weight:600;color:#64748b}
.calendar-cell{background:white;min-width:0;min-height:108px;padding:6px;display:flex;align-items:stretch;flex-direction:column;gap:3px}
.calendar-cell.muted{background:#f8fafc}.calendar-cell.today{background:color-mix(in srgb,var(--ui-primary) 4%,white)}
.calendar-cell header{display:flex;align-items:center;justify-content:space-between;min-height:26px;padding-left:4px;font-weight:600;font-size:12px}
.calendar-cell.muted header{color:#8292a8}
.calendar-cell [aria-current=date]{background:var(--ui-primary);color:white;border-radius:50%;display:grid;place-items:center;width:24px;height:24px}
.calendar-task,.calendar-more{border-radius:5px;text-align:left;font-size:11px;line-height:1.5;padding:3px 5px;display:flex;align-items:center;gap:5px;min-width:0}
.calendar-task{background:#f1f5f9}.calendar-task:hover,.calendar-more:hover{background:#e2e8f0}
.calendar-task-text,.calendar-task-text>*,.gantt-name>button:first-child,.gantt-name>span,.gantt-bar-label,.gantt-project-bar>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.calendar-task-text>*,.task-project-name{display:block}.calendar-task-text small,.task-project-name{font-size:10px;color:#64748b}.calendar-task.done .calendar-task-text>span{text-decoration:line-through}.task-dot{width:6px;height:6px;border-radius:50%;background:#64748b;flex-shrink:0}
.gantt-name>button:first-child>span,.gantt-name .task-project-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gantt{--day-min:29px;--name-width:11rem;--header-height:39px;position:relative;min-width:calc(var(--name-width) + var(--days)*var(--day-min))}
.gantt-marker-overlay{position:absolute;inset:var(--header-height) 0 0 var(--name-width);z-index:1;pointer-events:none}
.gantt-marker-line{position:absolute;top:0;bottom:0;border-left:2px dashed;transform:translateX(-50%)}
.gantt-marker-tooltip{position:fixed;z-index:40;pointer-events:none;max-width:min(15rem,calc(100vw - 16px));padding:7px 10px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-bg);box-shadow:0 4px 14px #0f172a20;color:var(--ui-text-highlighted);overflow-wrap:anywhere;font-size:12px}
.gantt-marker-tooltip.above-pointer{transform:translateY(-100%)}
.gantt-marker-tooltip time{display:block;color:var(--ui-text-muted)}
.gantt-legend,.gantt-legend ul,.gantt-legend li{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px}
.gantt-legend{font-size:12px;color:var(--ui-text-muted)}
.gantt-legend h3{font-weight:650;color:var(--ui-text)}
.gantt-legend li{gap:5px}
.gantt-legend li span{width:12px;height:9px;border-radius:3px;background:color-mix(in srgb,var(--stage) 18%,white);border:1px solid color-mix(in srgb,var(--stage) 55%,white)}
.gantt-task-actions{display:flex;align-items:center;flex-shrink:0}
.gantt-row{display:grid;grid-template-columns:var(--name-width) minmax(0,1fr);min-height:39px;border-bottom:1px solid #edf1f5}
.gantt-row:last-child{border-bottom:0}
.gantt-name{position:sticky;left:0;z-index:2;background:#fff;display:flex;align-items:center;justify-content:space-between;min-width:0;gap:4px;padding:4px 8px;border-right:1px solid #e2e8f0;text-align:left;font-size:12px}
.gantt-name>button:first-child{text-align:left}.gantt-name>button:first-child:hover,.planner-list li>button:first-child:hover{text-decoration:underline}
.gantt-track{display:grid;grid-template-columns:repeat(var(--days),minmax(0,1fr));align-items:center;background:repeating-linear-gradient(to right,transparent 0 calc(100% / var(--days) - 1px),#edf1f5 calc(100% / var(--days) - 1px) calc(100% / var(--days)))}
.gantt-header,.gantt-header .gantt-name{background:#f8fafc;font-weight:600}.gantt-header{min-height:var(--header-height)}.gantt-header .gantt-track>span{align-self:stretch;display:grid;place-content:center;text-align:center;overflow:hidden;font-size:10px;color:#64748b;line-height:1.2}.gantt-header .today{color:var(--ui-primary)!important;background:color-mix(in srgb,var(--ui-primary) 9%,white)}
.gantt-project-dates{display:flex;flex-wrap:wrap;gap:10px 28px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;font-size:13px}
.gantt-project-dates>div{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px}.gantt-project-dates dt{font-weight:600}.gantt-project-dates dt::before{content:'';display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%}
.gantt-project-dates .start::before{background:#0f766e}.gantt-project-dates .end::before{background:#6d28d9}.gantt-project-dates dd>span{color:#64748b}.gantt-project-dates button{text-decoration:underline;text-underline-offset:3px}
.gantt-header .project-start{border-top:3px solid #0f766e}.gantt-header .project-end{border-bottom:3px solid #6d28d9}
.gantt-project-row .gantt-name{font-weight:650;color:#0f5050}.gantt-project-row .gantt-track{background-color:#f5fbfa}
.gantt-project-bar{margin:3px 2px;border-radius:6px;min-width:0;min-height:24px;display:flex;align-items:center;background:linear-gradient(90deg,#ccfbf1,#ede9fe);border:1px solid #a7dcd7;color:#134e4a;font-size:11px;font-weight:600;padding:2px 7px}
.gantt-project-bar.continues-left{border-left:2px dashed #0f766e;border-start-start-radius:0;border-end-start-radius:0}.gantt-project-bar.continues-right{border-right:2px dashed #6d28d9;border-start-end-radius:0;border-end-end-radius:0}
.gantt-project-bar.milestone{width:10px;height:10px;min-height:0;padding:0;justify-self:center;border:0;transform:rotate(45deg);border-radius:2px;background:#0f766e}
.gantt-project-outside{grid-column:1/-1;justify-self:start;text-align:left;padding:0 8px;text-decoration:underline;color:#64748b;font-size:11px}
.gantt-bar{position:relative;display:flex;align-items:stretch;margin:3px 2px;border-radius:5px;background:color-mix(in srgb,var(--stage,#64748b) 18%,white);border:1px solid color-mix(in srgb,var(--stage,#64748b) 38%,white);height:25px;min-width:0;font-size:11px}
.gantt-bar-label{display:block;text-align:left;flex:1;min-width:0;padding:2px 4px}.gantt-bar:has(.gantt-edge-start) .gantt-bar-label{margin-left:8px}.gantt-bar:has(.gantt-edge-end) .gantt-bar-label{margin-right:8px}
.gantt-bar:hover{filter:brightness(.94)}.gantt-bar.done .gantt-bar-label{text-decoration:line-through}.gantt-bar.resizing{outline:2px solid var(--ui-primary);outline-offset:1px;cursor:ew-resize;user-select:none}
.gantt-edge{position:absolute;top:0;bottom:0;width:10px;display:grid;place-items:center;touch-action:none;cursor:ew-resize!important}.gantt-edge::after{content:'';width:3px;height:12px;border-inline:1px solid currentColor;opacity:.55}
.gantt-edge:hover,.gantt-edge:focus-visible{background:#0f172a16}.gantt-edge-start{left:0;border-radius:4px 0 0 4px}.gantt-edge-end{right:0;border-radius:0 4px 4px 0}
.planner-list{border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;background:#fff;font-size:13px}
.planner-list h3,.planner-list summary{font-weight:600}.planner-list summary{cursor:pointer}.planner-list small{margin-left:6px;color:#64748b}
.planner-list ul{max-height:270px;overflow:auto;margin-top:8px}.planner-list li{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #edf1f5}.planner-list li>button:first-child{text-align:left;overflow-wrap:anywhere}
.planner-day-list li+li{border-top:1px solid #edf1f5}.planner-empty{position:sticky;left:0;width:fit-content;font-size:13px;color:#64748b;padding:14px}
@media(max-width:600px){.gantt{--name-width:8rem}.calendar-cell{min-height:94px}}
@media(max-width:1200px){.gantt-filters{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:850px){.task-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
