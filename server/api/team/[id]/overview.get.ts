import { z } from 'zod'
import type { TeamProfileOverview } from '../../../../shared/types/team'

export default defineEventHandler(async (event): Promise<TeamProfileOverview> => {
  const context = await requireSharedUser(event)
  const target = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!target.success) throw createError({ statusCode: 400, message: 'Некорректный профиль' })
  const { data, error } = await context.client.rpc('team_profile_overview', { p_actor: context.user.id, p_target: target.data })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить сведения профиля' })
  if (!data) throw createError({ statusCode: 404, message: 'Участник не найден' })
  return data
})
