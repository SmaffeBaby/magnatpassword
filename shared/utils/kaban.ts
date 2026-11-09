import type { KabanTask } from '../types/kaban'
import { todayDate } from './subscriptions'
export const kabanFileLimit = 20 * 1024 * 1024
export const kabanOverdue = (task: Pick<KabanTask, 'dueOn'>, done = false, today = todayDate()) => !done && !!task.dueOn && task.dueOn < today
