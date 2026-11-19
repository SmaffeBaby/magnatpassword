import type { KabanTask } from '../types/kaban'
import { compareGanttTasks, type GanttTaskSort } from './project-task-planning'

type TimedSort = 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc'
export type KabanBoardSort = 'default' | Extract<GanttTaskSort, `${'due' | 'title'}-${'asc' | 'desc'}`> | TimedSort

const timestampSorts: Record<TimedSort, { key: 'createdAt' | 'updatedAt'; direction: number }> = {
  'created-desc': { key: 'createdAt', direction: -1 },
  'created-asc': { key: 'createdAt', direction: 1 },
  'updated-desc': { key: 'updatedAt', direction: -1 },
  'updated-asc': { key: 'updatedAt', direction: 1 }
}

export function groupKabanTasksByStage(tasks: readonly KabanTask[], sort: KabanBoardSort) {
  const groups = new Map<string, KabanTask[]>()
  for (const task of tasks) {
    const group = groups.get(task.stageId)
    if (group) group.push(task)
    else groups.set(task.stageId, [task])
  }
  if (sort === 'default') return groups

  for (const group of groups.values()) {
    group.sort((a, b) => {
      if (sort === 'due-asc' || sort === 'due-desc' || sort === 'title-asc' || sort === 'title-desc') return compareGanttTasks(a, b, sort)
      const { key, direction } = timestampSorts[sort]
      return direction * (Date.parse(a[key]) - Date.parse(b[key])) || compareGanttTasks(a, b, 'title-asc')
    })
  }
  return groups
}
