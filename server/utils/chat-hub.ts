import type { H3Event } from 'h3'
import { createHash, randomUUID } from 'node:crypto'
import type { ChatTaskReference } from '../../shared/types/project-chats'
export async function resolveChatTasks(event: H3Event, context: Awaited<ReturnType<typeof requireProjectsUser>>, refs: { taskId: string; boardId: string; title?: string; projectId?: string | null; vaultId?: string | null }[], strict: boolean): Promise<ChatTaskReference[]> {
  return Promise.all(refs.map(async ref => {
    const result = await context.client.rpc('kaban_task_access', { p_actor: context.user.id, p_task: ref.taskId, p_write: false, p_board: ref.boardId })
    if (result.error) { if (strict) kabanFailure(result.error); return { ...ref, title: ref.title || 'Задача Кабана', available: false } }
    const { data: board, error } = await context.client.from('kaban_boards').select('project_id,vault_id').eq('id', ref.boardId).maybeSingle()
    if (error || !board) { if (strict) throw createError({ statusCode: 503, message: 'Не удалось открыть задачу' }); return { ...ref, title: ref.title || 'Задача Кабана', available: false } }
    return { taskId: ref.taskId, boardId: ref.boardId, title: readKabanTaskData(event, result.data).title, projectId: board.project_id, vaultId: board.vault_id, available: true, completed: !!result.data.closed_at }
  }))
}
export function forwardedChatId(actor: string, operation: string, message: string) {
  const bytes = createHash('sha256').update(`chat-forward:${actor}:${operation}:${message}`).digest().subarray(0,16)
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export async function forwardChatMessages(event: H3Event, context: Awaited<ReturnType<typeof requireProjectsUser>>, body: { operationId: string; source: { projectId: string | null; chatId: string; messageIds: string[] }; target: { projectId: string | null; chatId: string } }) {
  const source = { context, project: body.source.projectId ?? 'personal', chat: body.source.chatId }, target = { context, project: body.target.projectId ?? 'personal', chat: body.target.chatId }
  await chatRpc(context, 'project_chat_check', { p_project: source.project, p_chat: source.chat })
  await chatRpc(context, 'project_chat_check', { p_project: target.project, p_chat: target.chat })
  const originals = await Promise.all(body.source.messageIds.map(id => chatRpc(context, 'project_chat_message_get', { p_project: source.project, p_chat: source.chat, p_message: id })))
  const passwordRows = source.project !== 'personal' && originals.some(row => !row.deletedAt && decodeChatContent(event, source.project, source.chat, row.id, row.encryptedData).passwordIds.length) ? await readProjectPasswords(context, source.project) : []
  const ids: string[] = []
  for (const row of originals.sort((a,b) => a.seq-b.seq)) {
    if (row.deletedAt) throw createError({ statusCode: 404, message: 'Сообщение удалено' })
    const id = forwardedChatId(context.user.id, body.operationId, row.id)
    const existing = await context.client.from('project_chat_messages').select('id,chat_id,author_id').eq('id',id).maybeSingle()
    if (existing.error) throw createError({statusCode:503,message:'Не удалось проверить пересылку'})
    if (existing.data) { if (existing.data.chat_id!==target.chat || existing.data.author_id!==context.user.id) throw createError({statusCode:409,message:'Операция пересылки уже использована'}); ids.push(id); continue }
    const content = decodeChatContent(event, source.project, source.chat, row.id, row.encryptedData)
    const decoded = (await decodeChatMessages(event, source, [row]))[0]!
    const copies = [...content.passwordCopies, ...content.passwordIds.flatMap(passwordId => { const password = passwordRows.find(item => item.id === passwordId); return password ? [decodeProjectPassword(event, source.project, password.id, password.encryptedData)] : [] })]
    if (copies.length > 10) throw createError({statusCode:400,message:'В одном сообщении можно переслать до 10 паролей'})
    const poll = content.poll ? { ...content.poll, options: content.poll.options.map(option => ({...option,id:randomUUID()})) } : undefined
    const todo = content.todo ? { ...content.todo, items: content.todo.items.map(item => ({...item,id:randomUUID()})) } : undefined
    const data = { ...content, tasks:decoded.tasks.map(({available,completed,...task})=>task), passwordIds: [], passwordCopies: copies, poll, todo, forwardedFrom: content.forwardedFrom ?? { authorId: row.authorId, authorName: decoded.authorName || 'Участник' } }
    if (!data.text && !data.poll && !data.todo && !data.tasks.length && !copies.length && !row.files.length) throw createError({statusCode:400,message:'В сообщении не осталось доступных вложений'})
    const files: string[] = []
    try {
      for (const file of row.files) {
        const stored = await chatRpc(context, 'project_chat_file_read', {p_project:source.project,p_chat:source.chat,p_file:file.id})
        const downloaded = await context.client.storage.from(projectDocumentBucket).download(stored.path)
        if (downloaded.error || !downloaded.data) throw createError({statusCode:404,message:'Вложение недоступно'})
        const metadata = decodeChatFile(event, source.project, source.chat, stored, context.user.id)
        const saved = await storeChatFile(event,target,{name:metadata.name,type:metadata.type,size:metadata.size,description:metadata.description,tags:metadata.tags},Buffer.from(await downloaded.data.arrayBuffer()))
        files.push(saved.id)
      }
      await chatRpc(context,'chat_forward_send',{p_source_project:source.project,p_source_chat:source.chat,p_source_message:row.id,p_source_revision:row.revision,p_target_project:target.project,p_target_chat:target.chat,p_message:id,
        p_data:sealSharedVault(data,sharedSecret(event),`project-chat:${target.project}:${target.chat}:${id}`,1),p_files:files,p_poll_options:poll?.options.map(option=>option.id)??[],p_todo_items:todo?.items.map(item=>item.id)??[]})
      for(const task of content.tasks) await chatRpc(context,'chat_task_link',{p_project:target.project,p_chat:target.chat,p_message:id,p_task:task.taskId,p_board:task.boardId}).catch(()=>{})
      ids.push(id)
    } catch (failure) {
      for (const file of files) await chatRpc(context,'project_chat_file_read',{p_project:target.project,p_chat:target.chat,p_file:file,p_delete:true}).catch(()=>{})
      await cleanupProjectDocuments(context).catch(()=>{}); throw failure
    }
  }
  return { ids }
}
