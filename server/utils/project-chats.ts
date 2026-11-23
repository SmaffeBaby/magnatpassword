import type { H3Event } from 'h3'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { EncryptedData } from '../../shared/types/vault'
import type { ProjectDocumentMetadata } from '../../shared/types/project-documents'
import type { ProjectChatActivity, ProjectChatFile } from '../../shared/types/project-chats'
import { documentMaxSize, documentMetadataSchema } from '../../shared/utils/project-documents'

export const chatManageSchema = z.object({ name: z.string().trim().min(1).max(120), members: z.array(z.uuid()).max(100) }).strict()
export const chatPollSchema = z.object({ question: z.string().trim().min(1).max(300), options: z.array(z.object({ id: z.uuid(), label: z.string().trim().min(1).max(160) }).strict()).min(2).max(20) }).strict().refine(value => new Set(value.options.map(option => option.id)).size === value.options.length)
export const chatTodoSchema = z.object({ title: z.string().trim().min(1).max(200), items: z.array(z.object({ id: z.uuid(), label: z.string().trim().min(1).max(300) }).strict()).min(1).max(100) }).strict().refine(value => new Set(value.items.map(item => item.id)).size === value.items.length)
export const chatTaskReferenceSchema = z.object({ taskId: z.uuid(), boardId: z.uuid() }).strict()
const chatSharedTaskSchema = chatTaskReferenceSchema.extend({ title: z.string().max(200), projectId: z.uuid().nullable().optional(), vaultId: z.uuid().nullable().optional() })
const chatForwardSchema = z.object({ authorId: z.uuid().nullable(), authorName: z.string().max(120) }).strict()
export const chatMessageSchema = z.object({ id: z.uuid(), text: z.string().trim().max(10000), fileIds: z.array(z.uuid()).max(10), passwordIds: z.array(z.uuid()).max(10), poll: chatPollSchema.optional(), todo: chatTodoSchema.optional(), tasks: z.array(chatTaskReferenceSchema).max(10).default([]) }).strict().refine(value => !!value.text || value.fileIds.length > 0 || value.passwordIds.length > 0 || !!value.poll || !!value.todo || value.tasks.length > 0)
const chatContentSchema = z.object({ text: z.string().max(10000), passwordIds: z.array(z.uuid()).max(10), poll: chatPollSchema.optional(), todo: chatTodoSchema.optional(), tasks: z.array(chatSharedTaskSchema).max(10).default([]), passwordCopies: z.array(credentialSchema).max(10).default([]), forwardedFrom: chatForwardSchema.optional() }).strict()
export async function projectChatContext(event: H3Event, requireChat = true) {
  const context = await requireProjectsUser(event), project = getRouterParam(event, 'id') === 'personal' ? 'personal' : projectId(event)
  const parsed = z.uuid().safeParse(getRouterParam(event, 'chatId'))
  if (requireChat && !parsed.success) throw createError({ statusCode: 400, message: 'Некорректная беседа' })
  const chat = parsed.success ? parsed.data : ''
  if (requireChat) await chatRpc(context, 'project_chat_check', { p_project: project, p_chat: chat })
  return { context, project, chat }
}
export function chatFailure(error: { message: string }): never {
  const errors: Record<string, [number, string]> = {
    REVISION_CONFLICT: [409, 'Данные беседы изменились. Обновите их и повторите действие.'],
    MESSAGE_NOT_FOUND: [404, 'Сообщение удалено или недоступно'],
    POLL_CLOSED: [409, 'Голосование уже завершено'],
    CHAT_NOT_FOUND: [404, 'Беседа не найдена или вы больше не её участник'],
    INVALID_CHAT: [400, 'Проверьте название, участников и содержимое сообщения'],
    CHAT_LIMIT: [400, 'В проекте можно создать до 100 бесед'],
    PASSWORD_NOT_FOUND: [404, 'Выбранный пароль удалён из проекта'],
    FILE_LIMIT: [400, 'Слишком много неотправленных вложений. Отправьте или уберите их.']
  }
  for (const [code, [statusCode, message]] of Object.entries(errors)) if (error.message.includes(code)) throw createError({ statusCode, message })
  documentFailure(error)
}
export async function chatRpc(context: Awaited<ReturnType<typeof requireProjectsUser>>, name: string, args: Record<string, unknown>) {
  const scoped = Object.fromEntries(Object.entries(args).map(([key,value]) => [key, ['p_project','p_source_project','p_target_project'].includes(key) && value === 'personal' ? null : value]))
  const { data, error } = await context.client.rpc(name, { p_actor: context.user.id, ...scoped })
  if (error) chatFailure(error)
  return data
}
export function decodeChatContent(event: H3Event, project: string, chat: string, id: string, encrypted: EncryptedData) {
  try { return chatContentSchema.parse(openSharedVault(encrypted, sharedSecret(event), `project-chat:${project}:${chat}:${id}`, 1)) }
  catch { throw createError({ statusCode: 503, message: 'Не удалось расшифровать сообщение' }) }
}
export function decodeChatFile(event: H3Event, project: string, chat: string, row: { id: string; documentId: string | null; encryptedData: EncryptedData; revision?: number; createdBy?: string | null }, actor?: string): ProjectChatFile {
  try {
    const metadata = openSharedVault<ProjectDocumentMetadata>(row.encryptedData, sharedSecret(event), `project-chat-file:${project}:${chat}:${row.id}`, 1)
    return { ...metadata, id: row.id, documentId: row.documentId, revision: row.revision ?? 1, canEdit: !!actor && row.createdBy === actor }
  } catch { throw createError({ statusCode: 503, message: 'Не удалось открыть вложение' }) }
}
export function chatFileId(event: H3Event) {
  const id = z.uuid().safeParse(getRouterParam(event, 'fileId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректное вложение' })
  return id.data
}
export async function storeChatFile(event: H3Event, current: Awaited<ReturnType<typeof projectChatContext>>, metadata: ProjectDocumentMetadata, bytes: Buffer, document?: { folderId: string | null }, source?: { id: string; revision: number }) {
  if (!bytes.length || bytes.length > documentMaxSize) throw createError({ statusCode: 413, message: 'Выберите непустой файл до 20 МБ' })
  const { context, project, chat } = current, id = randomUUID(), paths: string[] = []
  const path = `chat/${project}/${chat}/${id}/${randomUUID()}`
  async function upload(target: string) {
    const { error } = await context.client.storage.from(projectDocumentBucket).upload(target, bytes, { contentType: 'application/octet-stream', upsert: false })
    if (error) throw createError({ statusCode: 503, message: 'Не удалось сохранить вложение' })
    paths.push(target)
  }
  try {
    await upload(path)
    let doc: Record<string, unknown> | null = null
    if (document) {
      const docId = randomUUID(), docPath = `${project}/${docId}/${randomUUID()}`
      await upload(docPath)
      doc = { id: docId, path: docPath, folderId: document.folderId, encryptedData: sealSharedVault(metadata, sharedSecret(event), `project-document:${project}:${docId}`, 1) }
    }
    const encryptedData = sealSharedVault(metadata, sharedSecret(event), `project-chat-file:${project}:${chat}:${id}`, 1)
    const result = await chatRpc(context, 'project_chat_file_add', { p_project: project, p_chat: chat, p_file: id, p_data: encryptedData, p_path: path, p_document: doc, p_source: source ?? null })
    await cleanupProjectDocuments(context).catch(() => {})
    return { ...metadata, id, documentId: result.documentId, revision: 1, canEdit: true } as ProjectChatFile
  } catch (failure) { await discardProjectDocumentObjects(context, paths); throw failure }
}
export async function uploadChatFile(event: H3Event) {
  const current = await projectChatContext(event)
  const parts = await readMultipartFormData(event), file = parts?.find(part => part.name === 'file')
  if (!file?.filename || !file.data.length) throw createError({ statusCode: 400, message: 'Выберите непустой файл' })
  const metadata = documentMetadataSchema.safeParse({ name: file.filename.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 240), description: '', tags: [] })
  if (!metadata.success) throw createError({ statusCode: 400, message: 'Некорректное название файла' })
  const save = parts?.find(part => part.name === 'saveToDocuments')?.data.toString() === 'true'
  const folder = z.uuid().nullable().safeParse(parts?.find(part => part.name === 'folderId')?.data.toString() || null)
  if (!folder.success) throw createError({ statusCode: 400, message: 'Некорректная папка' })
  return storeChatFile(event, current, { ...metadata.data, size: file.data.length, type: (file.type || 'application/octet-stream').slice(0, 255) }, file.data, save ? { folderId: folder.data } : undefined)
}

export function chatMessageId(event: H3Event) {
  const id = z.uuid().safeParse(getRouterParam(event, 'messageId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректное сообщение' })
  return id.data
}
export async function chatMentions(context: Awaited<ReturnType<typeof requireProjectsUser>>, project: string, chat: string, text: string) {
  if (!text.includes('@')) return []
  const { chatMentionIds } = await import('../../shared/utils/project-chat-input')
  const chats = await chatRpc(context, 'project_chat_list', { p_project: project })
  const members: { userId: string }[] = chats.find((item: { id: string }) => item.id === chat)?.members ?? []
  if (!members.length) return []
  const { data, error } = await context.client.from('team_profiles').select('user_id,full_name').in('user_id', members.map(member => member.userId))
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить упоминания' })
  return chatMentionIds(text, data.map(person => ({ id: person.user_id, name: person.full_name || 'Участник' })))
}
const chatActivitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['created', 'avatar-changed', 'avatar-removed']) }),
  z.object({ kind: z.enum(['pinned', 'unpinned']), messageSeq: z.number().int().positive() }),
  z.object({ kind: z.enum(['members-added', 'members-removed']), memberIds: z.array(z.uuid()).min(1).max(100) }),
  z.object({ kind: z.literal('renamed'), name: z.string().min(1).max(120) })
])

export async function decodeChatMessages(event: H3Event, current: Awaited<ReturnType<typeof projectChatContext>>, rows: any[]) {
  const parsed = rows.map(row => ({ row, activity: chatActivitySchema.safeParse(row.activity).data }))
  const authors = new Set<string>(rows.map(row => row.authorId).filter(Boolean))
  const ids = [...new Set([...authors, ...parsed.flatMap(({activity}) =>
    activity && 'memberIds' in activity ? activity.memberIds.slice(0, 3) : [])])]
  const profiles = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await current.context.client.from('team_profiles').select('user_id,full_name,avatar_path').in('user_id', ids.slice(offset, offset + 100))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить участников беседы' })
    profiles.push(...data)
  }
  const people = new Map((await teamPeople(current.context, profiles.filter(profile => authors.has(profile.user_id)))).map(person => [person.id, person]))
  const names = new Map(profiles.map(profile => [profile.user_id, profile.full_name]))
  return Promise.all(parsed.map(async ({ row, activity }) => {
    const { encryptedData, files, activity: storedActivity, ...message } = row
    const author = people.get(row.authorId)
    const content = row.deletedAt || storedActivity ? { text: '', passwordIds: [], tasks: [], passwordCopies: [] } : decodeChatContent(event, current.project, current.chat, row.id, encryptedData)
    const action: ProjectChatActivity | undefined = activity && 'memberIds' in activity
      ? { kind: activity.kind, memberCount: activity.memberIds.length, memberNames: activity.memberIds.slice(0, 3).map(id => names.get(id) || 'Участник') }
      : activity
    const tasks = await resolveChatTasks(event, current.context, content.tasks, false)
    return { ...message, ...content, tasks, activity: action,
      authorName: author?.fullName || 'Участник', authorAvatarUrl: author?.avatarUrl || '',
      files: row.deletedAt || storedActivity ? [] : files.map((file: any) => decodeChatFile(event, current.project, current.chat, file, current.context.user.id)) }
  })) as Promise<import('../../shared/types/project-chats').ProjectChatMessage[]>
}
export async function readChatPage(event: H3Event, current: Awaited<ReturnType<typeof projectChatContext>>, before: number | null, pinned = false, search = '') {
  const matches: any[] = []
  let cursor = before
  // Search encrypted history on the server in bounded batches, continuing via the returned cursor.
  for (let page = 0; page < (search ? 17 : 1); page++) {
    const result = await chatRpc(current.context, 'project_chat_feed', { p_project: current.project, p_chat: current.chat, p_before: cursor, p_pinned: pinned })
    if (!search) return { messages: await decodeChatMessages(event, current, result.messages), nextBefore: result.nextBefore }
    const term = search.normalize('NFKC').toLocaleLowerCase('ru')
    for (const row of [...result.messages].reverse()) {
      if (row.deletedAt || row.activity) continue
      const data = decodeChatContent(event, current.project, current.chat, row.id, row.encryptedData)
      const text = [data.text, data.poll?.question, ...(data.poll?.options.map(option => option.label) ?? []), data.todo?.title, ...(data.todo?.items.map(item => item.label) ?? []), ...data.tasks.map(task=>task.title), ...data.passwordCopies.map(password=>password.title)].join(' ').normalize('NFKC').toLocaleLowerCase('ru')
      if (text.includes(term)) matches.push(row)
      if (matches.length === 60) return { messages: await decodeChatMessages(event, current, matches.reverse()), nextBefore: row.seq }
    }
    cursor = result.nextBefore
    if (!cursor) break
  }
  return { messages: await decodeChatMessages(event, current, matches.reverse()), nextBefore: cursor }
}
