export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const body = await sharedBody(event, chatMessageSchema)
  const tasks = (await resolveChatTasks(event, context, body.tasks, true)).map(({ available, completed, ...task }) => task)
  const content = { text: body.text, passwordIds: [...new Set(body.passwordIds)], poll: body.poll, todo: body.todo, tasks }
  const mentions = await chatMentions(context, project, chat, content.text)
  return chatRpc(context, 'chat_send_message', { p_project: project, p_chat: chat, p_message: body.id,
    p_data: sealSharedVault(content, sharedSecret(event), `project-chat:${project}:${chat}:${body.id}`, 1),
    p_files: [...new Set(body.fileIds)], p_passwords: content.passwordIds, p_mentions: mentions,
    p_poll_options: body.poll?.options.map(option => option.id) ?? [], p_todo_items: body.todo?.items.map(item => item.id) ?? [], p_tasks: body.tasks })
})
