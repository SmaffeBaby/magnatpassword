import { z } from 'zod'
import { normalizePeopleQuery } from '~~/shared/utils/team'
import { teamPeople } from '../../../utils/team'

export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const id = projectId(event)
  const query = await getValidatedQuery(event, z.object({ q: z.string().max(120).default(''), page: z.coerce.number().int().min(1).max(1000000).default(1) }).parse)
  const pageSize = 30
  const { data, error } = await context.client.rpc('project_member_candidates', {
    p_actor: context.user.id, p_id: id, p_query: normalizePeopleQuery(query.q), p_offset: (query.page - 1) * pageSize
  })
  if (error?.message.includes('ACCESS_DENIED')) throw createError({ statusCode: 403, message: 'Недостаточно прав для добавления участников' })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить список участников' })
  const rows = data ?? []
  return { people: await teamPeople(context, rows.slice(0, pageSize)), hasMore: rows.length > pageSize }
})
