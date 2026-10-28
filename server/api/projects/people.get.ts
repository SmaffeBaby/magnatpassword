import { z } from 'zod'
import { teamPeople } from '../../utils/team'
import { normalizePeopleQuery } from '~~/shared/utils/team'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const parsed = z.string().trim().min(2).max(120).safeParse(getQuery(event).q)
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Укажите минимум два символа для поиска' })
  const { data, error } = await context.client.rpc('search_project_people', { p_actor: context.user.id, p_query: normalizePeopleQuery(parsed.data) })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось найти участников проектов' })
  return teamPeople(context, data ?? [])
})
