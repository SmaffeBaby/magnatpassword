import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const body = await sharedBody(event, z.object({ seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict())
  await chatRpc(context, 'project_chat_mark_read', { p_project: project, p_chat: chat, p_seq: body.seq })
  return { ok: true }
})
