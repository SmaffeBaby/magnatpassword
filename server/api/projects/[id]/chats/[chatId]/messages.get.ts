import { z } from 'zod'
const sequence = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const messagesQuery = z.object({
  before: sequence.optional(),
  around: sequence.optional(),
  search: z.string().trim().max(200).default(''),
  pinned: z.enum(['true', 'false']).default('false')
}).refine(query => !query.around || (!query.before && !query.search && query.pinned === 'false'))

export default defineEventHandler(async event => {
  const current = await projectChatContext(event)
  const query = messagesQuery.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, message: 'Некорректный поиск или страница сообщений' })
  const { around, before, pinned, search } = query.data
  let cursor = before ?? null
  if (around) {
    // Leave room in the existing history page for messages on both sides of the anchor.
    const { data, error } = await current.context.client.from('project_chat_messages').select('seq')
      .eq('chat_id', current.chat).gt('seq', around).order('seq', { ascending: true }).limit(25)
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить сообщения рядом с выбранным' })
    cursor = data[24]?.seq ?? null
  }
  return readChatPage(event, current, cursor, pinned === 'true', search)
})
