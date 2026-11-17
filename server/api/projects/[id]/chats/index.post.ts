import { randomUUID } from 'node:crypto'
export default defineEventHandler(async event => {
  const { context, project } = await projectChatContext(event, false)
  const body = await sharedBody(event, chatManageSchema)
  return chatRpc(context, 'project_chat_manage', { p_project: project, p_chat: randomUUID(), p_revision: 0, p_name: body.name, p_members: [...new Set(body.members)] })
})
