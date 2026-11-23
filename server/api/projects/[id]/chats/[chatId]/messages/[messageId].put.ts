import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await projectChatContext(event), { context, project, chat } = current, id = chatMessageId(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, text: z.string().trim().max(10000) }).strict())
  const row = await chatRpc(context, 'project_chat_message_get', { p_project: project, p_chat: chat, p_message: id })
  if (row.deletedAt) throw createError({ statusCode: 404, message: 'Сообщение удалено' })
  if (row.authorId !== context.user.id) throw createError({ statusCode: 403, message: 'Редактировать сообщение может только отправитель' })
  const original=decodeChatContent(event, project, chat, id, row.encryptedData)
  const content = { ...original, text: body.text, forwardedFrom:original.text===body.text?original.forwardedFrom:undefined }
  if (!content.text && !row.files.length && !content.passwordIds.length && !content.poll && !content.todo && !content.tasks.length && !content.bookings.length && !content.passwordCopies.length) throw createError({ statusCode: 400, message: 'Сообщение не может быть пустым' })
  await chatRpc(context, 'project_chat_message_change', { p_project: project, p_chat: chat, p_message: id, p_revision: body.revision, p_action: 'edit',
    p_data: sealSharedVault(content, sharedSecret(event), `project-chat:${project}:${chat}:${id}`, 1), p_mentions: await chatMentions(context, project, chat, content.text) })
  return { ok: true }
})
