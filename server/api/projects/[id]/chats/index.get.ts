export default defineEventHandler(async event => {
  const { context, project } = await projectChatContext(event, false)
  return chatRpc(context, 'project_chat_list', { p_project: project })
})
