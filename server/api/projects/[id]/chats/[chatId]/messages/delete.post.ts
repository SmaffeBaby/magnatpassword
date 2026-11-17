import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const body = await sharedBody(event, z.object({ messages: z.array(z.object({ id: z.uuid(), revision: revisionSchema }).strict()).min(1).max(5000) }).strict().refine(value => new Set(value.messages.map(item => item.id)).size === value.messages.length))
  const result = await chatRpc(context, 'project_chat_delete_many', { p_project: project, p_chat: chat, p_messages: body.messages })
  await cleanupProjectDocuments(context).catch(() => {})
  return result
})
