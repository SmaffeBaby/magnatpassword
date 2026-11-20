import type { ProjectChat, ProjectChatParticipant } from '../../../../../../shared/types/project-chats'

export default defineEventHandler(async (event): Promise<ProjectChatParticipant[]> => {
  const { context, project, chat } = await projectChatContext(event)
  const chats: ProjectChat[] = await chatRpc(context, 'project_chat_list', { p_project: project })
  const current = chats.find(item => item.id === chat)
  if (!current) throw createError({ statusCode: 404, message: 'Беседа недоступна' })
  const ids = current.members.map(member => member.userId)
  if (!ids.length) return []

  const [profiles, devices] = await Promise.all([
    context.client.from('team_profiles').select('*').in('user_id', ids),
    context.client.from('account_devices').select('user_id,last_seen').in('user_id', ids).order('last_seen', { ascending: false })
  ])
  if (profiles.error || devices.error) throw createError({ statusCode: 503, message: 'Не удалось загрузить участников беседы' })
  const people = new Map((await teamPeople(context, profiles.data)).map(person => [person.id, person]))
  const seen = new Map<string, string>()
  for (const device of devices.data) {
    if (!seen.has(device.user_id)) seen.set(device.user_id, device.last_seen)
  }
  const recent = Date.now() - 75_000
  return ids.map(userId => {
    const person = people.get(userId)
    const lastSeenAt = seen.get(userId) ?? null
    return {
      userId,
      name: person?.fullName || 'Участник',
      avatarUrl: person?.avatarUrl ?? '',
      lastSeenAt,
      online: lastSeenAt !== null && Date.parse(lastSeenAt) >= recent
    }
  })
})
