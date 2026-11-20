export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event)
  const row = await chatRpc(context, 'project_chat_file_read', { p_project: project, p_chat: chat, p_file: chatFileId(event) })
  const revision=getQuery(event).revision
  if(revision!==undefined&&Number(revision)!==row.revision)throw createError({statusCode:409,message:'Файл изменился. Обновите беседу и откройте его заново.'})
  const file = decodeChatFile(event, project, chat, row, context.user.id)
  if (getQuery(event).meta === '1') return file
  const { data, error } = await context.client.storage.from(projectDocumentBucket).download(row.path)
  if (error || !data) throw createError({ statusCode: 404, message: 'Вложение недоступно' })
  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
  return Buffer.from(await data.arrayBuffer())
})
