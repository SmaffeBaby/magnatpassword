import type { ProjectChatHeader } from '../../../../../../shared/types/project-chats'

export default defineEventHandler(async (event): Promise<ProjectChatHeader> => {
  const { context, project, chat } = await projectChatContext(event, false)
  if (!chat) throw createError({ statusCode: 400, message: 'Некорректная беседа' })
  const meta = await chatRpc(context, 'project_chat_header', { p_project: project, p_chat: chat })
  if (!meta.peerId) return { avatar: meta.avatar ?? '', peer: null }

  const { data, error } = await context.client.from('team_profiles').select('*').eq('user_id', meta.peerId).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить профиль собеседника' })
  const [person] = await teamPeople(context, data ? [data] : [])
  return {
    avatar: '',
    peer: {
      name: person?.fullName ?? '',
      avatarUrl: person?.avatarUrl ?? '',
      lastSeenAt: meta.lastSeenAt,
      online: meta.online
    }
  }
})
