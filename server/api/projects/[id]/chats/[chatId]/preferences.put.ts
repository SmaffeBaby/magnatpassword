import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const body = await sharedBody(event, z.object({ muted: z.boolean() }).strict())
  await chatRpc(context, 'project_chat_preferences', { p_project: project, p_chat: chat, p_muted: body.muted })
  return { ok: true }
})
