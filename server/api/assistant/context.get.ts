import { z } from 'zod'
import { assistantContext } from '../../utils/assistant-context'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const query = z.object({ projectId: z.uuid().optional(), vaultId: z.union([z.literal('personal'), z.uuid()]).optional() }).strict().safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, message: 'Некорректный контекст помощника.' })
  return assistantContext(event, query.data)
})
