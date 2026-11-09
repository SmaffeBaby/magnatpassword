import type { KabanTask } from '../types/kaban'
import { todayDate } from './subscriptions'
export const kabanFileLimit = 20 * 1024 * 1024
export const kabanCanEditPlanning = (actorId: string | undefined, task: Pick<KabanTask, 'creatorId'>) => !!actorId && actorId === task.creatorId
export function kabanPlanningChanged(previous: Pick<KabanTask, 'dueOn' | 'participantIds'>, next: Pick<KabanTask, 'dueOn' | 'participantIds'>) {
  const before = new Set(previous.participantIds), after = new Set(next.participantIds)
  return previous.dueOn !== next.dueOn || before.size !== after.size || [...before].some(id => !after.has(id))
}
export const kabanOverdue = (task: Pick<KabanTask, 'dueOn'>, done = false, today = todayDate()) => !done && !!task.dueOn && task.dueOn < today
