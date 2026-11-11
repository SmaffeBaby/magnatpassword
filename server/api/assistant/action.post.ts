import { z } from 'zod'
import { kabanTaskSchema, kabanFailure, readKabanTaskData } from '../../utils/kaban'
import { assistantFetch } from '../../utils/assistant-context'
const schema = kabanTaskSchema.extend({ operation: z.enum(['create_task', 'edit_task', 'move_task']), taskId: z.uuid().optional(), revision: z.number().int().min(0) }).strict()
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Проверьте поля задачи, категорию и стадию.' })
  const { operation, taskId, ...body } = parsed.data
  if (operation !== 'create_task' && !taskId) throw createError({ statusCode: 400, message: 'Выберите задачу.' })
  if (operation === 'create_task' && body.revision !== 0) throw createError({ statusCode: 400, message: 'Некорректная версия новой задачи.' })
  if (operation === 'move_task') {
    const current = await context.client.rpc('kaban_task_access', { p_actor: context.user.id, p_task: taskId, p_write: true, p_board: body.boardId })
    if (current.error) kabanFailure(current.error)
    body.data = readKabanTaskData(event, current.data)
    body.participantIds = current.data.participant_ids; body.closerIds = current.data.closer_ids; body.categoryIds = current.data.category_ids
  }
  // All field, creator, stage-completion and optimistic-lock checks stay in the existing mutation.
  const result = await assistantFetch<{ id: string }>(event, operation === 'create_task' ? '/api/kaban/tasks' : `/api/kaban/tasks/${taskId}`, { method: operation === 'create_task' ? 'POST' : 'PUT', body })
  return { ...result, message: operation === 'create_task' ? 'Задача создана.' : operation === 'move_task' ? 'Задача перемещена.' : 'Задача обновлена.' }
})
