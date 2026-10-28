import type { H3Event } from 'h3'
import { z } from 'zod'

export const projectNameSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict()
export async function requireProjectsUser(event: H3Event) {
  const context = await requireSharedUser(event)
  const { data, error } = await context.client.from('project_access').select('user_id').eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить доступ к проектам' })
  if (!data) throw createError({ statusCode: 403, message: 'Доступ к разделу «Проекты» выдаёт администратор' })
  return context
}
export function projectId(event: H3Event) {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Некорректный проект' })
  return parsed.data
}
export function projectFailure(error: { message: string }) {
  const errors: Record<string, [number, string]> = {
    ACCESS_DENIED: [403, 'Недостаточно прав для этого действия'],
    PROJECT_NOT_FOUND: [404, 'Проект не найден или недоступен'],
    REVISION_CONFLICT: [409, 'Проект изменился. Обновите данные и повторите действие.'],
    OWNER_REQUIRED: [400, 'Права создателя проекта нельзя изменить'],
    USER_NOT_ELIGIBLE: [400, 'Сначала администратор должен выдать участнику доступ к разделу «Проекты»'],
    USER_NOT_FOUND: [404, 'Пользователь не найден']
  }
  const mapped = Object.entries(errors).find(([code]) => error.message.includes(code))?.[1]
  throw createError({ statusCode: mapped?.[0] ?? 503, message: mapped?.[1] ?? 'Не удалось сохранить проект' })
}
export async function mutateProject(context: Awaited<ReturnType<typeof requireProjectsUser>>, action: string, id: string, revision: number, payload: Record<string, unknown>) {
  const { error } = await context.client.rpc('project_mutate', { p_actor: context.user.id, p_action: action, p_id: id, p_revision: revision, p_payload: payload })
  if (error) projectFailure(error)
  return { ok: true }
}
