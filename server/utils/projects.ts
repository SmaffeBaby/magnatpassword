import type { H3Event } from 'h3'
import { z } from 'zod'

export const projectNameSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict()
export async function requireProjectsUser(event: H3Event) {
  return requireSharedUser(event)
}
export function projectId(event: H3Event) {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Некорректный проект' })
  return parsed.data
}
export function projectFailure(error: { message: string }): never {
  const errors: Record<string, [number, string]> = {
    ACCESS_DENIED: [403, 'Недостаточно прав для этого действия'],
    PROJECT_NOT_FOUND: [404, 'Проект не найден или недоступен'],
    REVISION_CONFLICT: [409, 'Проект изменился. Обновите данные и повторите действие.'],
    OWNER_REQUIRED: [400, 'Права создателя проекта нельзя изменить'],
    USER_NOT_ELIGIBLE: [400, 'Пользователь недоступен для добавления в проект'],
    INVALID_PERMISSION: [400, 'Некорректные права участника'],
    PROJECT_ROLE_NOT_FOUND: [404, 'Роль проекта не найдена'],
    PROJECT_ROLE_NAME_EXISTS: [409, 'В проекте уже есть роль с таким названием'],
    PROJECT_ROLE_ASSIGNED: [409, 'Права участника определяются назначенной ролью'],
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
