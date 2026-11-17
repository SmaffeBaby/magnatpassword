import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event), id = chatMessageId(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema }).strict())
  await chatRpc(context, 'project_chat_message_change', { p_project: project, p_chat: chat, p_message: id, p_revision: body.revision, p_action: 'delete' })
  await cleanupProjectDocuments(context).catch(() => {})
  return { ok: true }
})
