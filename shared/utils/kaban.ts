import type { KabanTask, KabanTaskData, KabanBlock } from '../types/kaban'
import { todayDate } from './subscriptions'
export const kabanFileLimit = 20 * 1024 * 1024
export const kabanCanEditPlanning = (actorId: string | undefined, task: Pick<KabanTask, 'creatorId'>) => !!actorId && actorId === task.creatorId
export function kabanPlanningChanged(previous: Pick<KabanTask, 'dueOn' | 'participantIds'>, next: Pick<KabanTask, 'dueOn' | 'participantIds'>) {
  const before = new Set(previous.participantIds), after = new Set(next.participantIds)
  return previous.dueOn !== next.dueOn || before.size !== after.size || [...before].some(id => !after.has(id))
}
export const kabanOverdue = (task: Pick<KabanTask, 'dueOn'>, done = false, today = todayDate()) => !done && !!task.dueOn && task.dueOn < today

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
export function kabanLink(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}}
