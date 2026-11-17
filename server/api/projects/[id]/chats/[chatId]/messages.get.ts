import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await projectChatContext(event)
  const query = z.object({ before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), search: z.string().trim().max(200).default(''), pinned: z.enum(['true','false']).default('false') }).safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, message: 'Некорректный поиск или страница сообщений' })
  return readChatPage(event, current, query.data.before ?? null, query.data.pinned === 'true', query.data.search)
})
