import type { KabanTaskData } from '../types/kaban'
import { addPeriod, dayDifference } from './subscriptions'

export const projectTaskViews = [
  { value: 'board', label: 'Кабан', icon: 'i-magnat-boar' },
  { value: 'calendar', label: 'Календарь задач', icon: 'i-lucide-calendar-days' },
  { value: 'gantt', label: 'Диаграмма Ганта', icon: 'i-lucide-chart-gantt' }
] as const

export function projectTaskView(value: unknown) {
  return value === 'calendar' || value === 'gantt' ? value : 'board'
}

export const projectTaskLists = [
  { value: 'mine', label: 'Мои задачи', icon: 'i-lucide-user-round-check' },
  { value: 'all', label: 'Все задачи', icon: 'i-lucide-list-checks' }
] as const

export type ProjectTaskListMode = typeof projectTaskLists[number]['value']
export const projectTaskNavigation = [...projectTaskLists, ...projectTaskViews]

export function projectTaskSection(value: unknown) {
  return projectTaskLists.find(list => list.value === value) ?? projectTaskViews.find(view => view.value === projectTaskView(value))!
}

export type TaskPeriod = 'day' | 'month' | '1' | '2' | '3' | '4' | '8'
export interface TaskDateRange { start: string; end: string }
export type TaskDateEdge = 'start' | 'end'
export type GanttTaskSort = `${'start' | 'due' | 'title'}-${'asc' | 'desc'}`
export interface PlanningProjectBoard {
  boardId: string
  name: string
  startOn?: string
  endOn?: string
}
export interface GanttMarker {
  id: string
  projectId: string
  day: string
  title: string
  color: string
  revision: number
}
export interface GanttMarkerProject {
  id: string
  name: string
  canEdit: boolean
}

function monday(date: string) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  return addPeriod(date, -daysSinceMonday, 'day') || date
}

export function taskPlanningDays(anchor: string, period: TaskPeriod) {
  if (period === 'day') return [anchor]
  const first = anchor.slice(0, 7) + '-01'
  const start = monday(period === 'month' ? first : anchor)
  const next = addPeriod(first, 1, 'month')
  const count = period === 'month' ? (next ? Math.ceil(dayDifference(start, next) / 7) * 7 : 42) : Number(period) * 7
  return Array.from({ length: count }, (_, offset) => addPeriod(start, offset, 'day')).filter(Boolean)
}

export function shiftTaskPlanningPeriod(anchor: string, period: TaskPeriod, direction: number) {
  const steps = period === 'month' || period === 'day' ? 1 : Number(period) * 7
  return addPeriod(anchor, direction * steps, period === 'month' ? 'month' : 'day') || anchor
}

export function taskDateRange(task: Pick<KabanTaskData, 'startOn' | 'dueOn'>): TaskDateRange | null {
  const start = task.startOn || task.dueOn
  return start ? { start, end: task.dueOn || start } : null
}

export function clipTaskDateRange(range: TaskDateRange, first: string, last: string): TaskDateRange | null {
  const start = range.start < first ? first : range.start
  const end = range.end > last ? last : range.end
  return start <= end ? { start, end } : null
}

export function resizeTaskDateRange(range: TaskDateRange, edge: TaskDateEdge, date: string): TaskDateRange {
  if (edge === 'start') return { start: date > range.end ? range.end : date, end: range.end }
  return { start: range.start, end: date < range.start ? range.start : date }
}

const taskNames = new Intl.Collator('ru', { numeric: true })

export function compareGanttTasks(a: Pick<KabanTaskData, 'startOn' | 'dueOn' | 'title'>, b: Pick<KabanTaskData, 'startOn' | 'dueOn' | 'title'>, sort: GanttTaskSort): number {
  const direction = sort.endsWith('-desc') ? -1 : 1
  const byName = taskNames.compare(a.title, b.title)
  if (sort.startsWith('title-')) return direction * byName

  const byStart = sort.startsWith('start-')
  const dateA = byStart ? a.startOn || a.dueOn : a.dueOn
  const dateB = byStart ? b.startOn || b.dueOn : b.dueOn
  if (!dateA || !dateB) return Number(!dateA) - Number(!dateB) || byName

  const byDate = direction * dateA.localeCompare(dateB)
  const byEnd = byStart ? (a.dueOn || dateA).localeCompare(b.dueOn || dateB) : 0
  return byDate || byEnd || byName
}
