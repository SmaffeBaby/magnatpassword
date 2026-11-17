import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const body = await sharedBody(event, chatManageSchema.extend({ revision: revisionSchema }))
  return chatRpc(context, 'project_chat_manage', { p_project: project, p_chat: chat, p_revision: body.revision, p_name: body.name, p_members: [...new Set(body.members)] })
})
