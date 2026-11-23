import type { H3Event } from 'h3'
import type { AppNotification } from '../../shared/types/subscriptions'
export async function projectChatNotifications(event: H3Event, context: Awaited<ReturnType<typeof requireSharedUser>>, records: any[]): Promise<AppNotification[]> {
  if (!records.length) return []
  const items = await chatRpc(context, 'project_chat_notification_messages', { p_ids: records.map(record => record.id) })
  return items.map((item: any) => {
    const record = records.find(record => record.id === item.notificationId)!
    const content = decodeChatContent(event, item.projectId ?? 'personal', item.chatId, item.message.id, item.message.encryptedData)
    const mention = item.message.mentionIds.includes(context.user.id)
    const preview = content.text || (content.poll ? `Голосование: ${content.poll.question}` : content.todo ? `Список дел: ${content.todo.title}` : content.tasks.length ? `Задача: ${content.tasks[0]!.title}` : content.bookings.length ? `Бронь: ${content.bookings[0]!.title}` : content.passwordIds.length||content.passwordCopies.length ? 'Пароль' : 'Вложение')
    return { id: record.id, kind: 'project-chat' as const, title: `${mention ? 'Вас упомянули' : 'Новое сообщение'} · ${item.chatName}`,
      message: `${item.projectName} · ${preview.slice(0, 180)}`, createdAt: record.created_at, readAt: record.read_at,
      projectId: item.projectId, chatId: item.chatId, messageSeq: item.message.seq,
      vaultId: null, entryId: null, fieldId: null }
  })
}
