import type { KabanStage, KabanTask } from '../types/kaban'
import type { Project } from '../types/projects'
import { addPeriod } from './subscriptions'
export interface KabanTaskRow { task: KabanTask; project: Pick<Project, 'id' | 'name'>; stage?: KabanStage }
export interface KabanTaskFilters { search: string; project: string; stage: string; deadline: string }
export function filterKabanTaskRows(rows: KabanTaskRow[], filters: KabanTaskFilters, today: string) {
 const tokens=filters.search.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean)
 return rows.filter(({task,project,stage})=>{
  if(filters.project!=='all'&&project.id!==filters.project)return false
  if(filters.stage!=='all'&&stage?.name!==filters.stage)return false
  const text=`${task.title} ${task.description} ${project.name}`.toLocaleLowerCase('ru')
  if(tokens.some(token=>!text.includes(token)))return false
  if(filters.deadline==='overdue')return !!task.dueOn&&task.dueOn<today&&!stage?.done
  if(filters.deadline==='today')return task.dueOn===today
  if(filters.deadline==='week')return !!task.dueOn&&task.dueOn>=today&&task.dueOn<=addPeriod(today,7,'day')
  if(filters.deadline==='none')return !task.dueOn
  return true
 })
}
