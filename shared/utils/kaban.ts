import type { KabanTask, KabanTaskData, KabanBlock } from '../types/kaban'
import { kabanTaskStage } from './kaban-stages'
import { dayDifference, todayDate, validDate } from './subscriptions'
export const kabanFileLimit = 20 * 1024 * 1024
export const kabanCanEditPlanning = (actorId: string | undefined, task: Pick<KabanTask, 'creatorId'>) => !!actorId && actorId === task.creatorId
export function kabanPlanningChanged(previous: Pick<KabanTask, 'startOn' | 'dueOn' | 'participantIds'>, next: Pick<KabanTask, 'startOn' | 'dueOn' | 'participantIds'>) {
  const before = new Set(previous.participantIds), after = new Set(next.participantIds)
  return (previous.startOn || '') !== (next.startOn || '') || previous.dueOn !== next.dueOn || before.size !== after.size || [...before].some(id => !after.has(id))
}
export const kabanOverdue = (task: Pick<KabanTask, 'dueOn'>, done = false, today = todayDate()) => !done && !!task.dueOn && task.dueOn < today

const deadlineWarningDays = 7
export function kabanDeadlineProgress(task: Pick<KabanTask, 'startOn' | 'dueOn' | 'createdAt'>, today: string) {
  if (!validDate(task.dueOn)) return null
  const created = new Date(task.createdAt)
  const start = task.startOn && validDate(task.startOn) ? task.startOn
    : Number.isFinite(created.getTime()) ? todayDate(created) : ''
  const duration = start ? Math.max(1, dayDifference(start, task.dueOn)) : deadlineWarningDays
  const daysLeft = dayDifference(today, task.dueOn)
  const percent = daysLeft <= 0 ? 100 : Math.max(0, Math.min(99, Math.round((1 - daysLeft / duration) * 100)))
  const hue = daysLeft <= 3 ? Math.max(0, daysLeft) * 13 : 39 + (Math.min(deadlineWarningDays, daysLeft) - 3) * (115 / 4)
  return { daysLeft, percent, hue }
}

// Legacy tasks receive stable block IDs without changing their stored contents.
export function kabanBlocks(data: KabanTaskData, taskId: string): KabanBlock[] {
 if(data.blocks)return data.blocks
 const id=(suffix:string)=>taskId.slice(0,-2)+suffix
 return [
  ...(data.description?[{id:id('01'),type:'description' as const,title:'Описание',value:data.description}]:[]),
  ...(data.todos.length?[{id:id('02'),type:'todo' as const,title:'To-do список',items:data.todos}]:[]),
  {id:id('03'),type:'files',title:'Файлы и фотографии'}
 ]
}
export function kabanBlockSummary(blocks: KabanBlock[]) {
 return {description:blocks.filter(block=>block.type==='description').map(block=>block.value).join('\n\n'),todos:blocks.flatMap(block=>block.type==='todo'?block.items:[])}
}
export function kabanTaskBody(task: KabanTask, selectedScope?: string) {
  const scopeCategoryId = selectedScope || task.scopeCategoryId || task.categoryIds[0]
  return {
    scopeCategoryId, boardId: task.boardId, revision: task.revision,
    stageId: selectedScope ? kabanTaskStage(task, scopeCategoryId) : task.stageId,
    participantIds: task.participantIds, closerIds: task.closerIds, categoryIds: task.categoryIds,
    data: {
      title: task.title, description: task.description, startOn: task.startOn, dueOn: task.dueOn, todos: task.todos,
      ...(task.blocks ? { ...kabanBlockSummary(task.blocks), blocks: task.blocks } : {})
    }
  }
}
export function kabanLink(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}}
