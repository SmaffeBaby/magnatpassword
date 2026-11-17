export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  await chatRpc(context, 'project_chat_file_read', { p_project: project, p_chat: chat, p_file: chatFileId(event), p_delete: true })
  await cleanupProjectDocuments(context)
  return { ok: true }
})
