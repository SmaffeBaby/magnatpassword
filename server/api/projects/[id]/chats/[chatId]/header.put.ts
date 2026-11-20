import { z } from 'zod'
import { projectAvatarSchema } from '../../../../../../shared/utils/project-workspace'

export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event, false)
  if (!chat) throw createError({ statusCode: 400, message: 'Некорректная беседа' })
  const { avatar, revision } = await sharedBody(event, z.object({ avatar: projectAvatarSchema, revision: revisionSchema }).strict())
  await chatRpc(context, 'project_chat_set_avatar', { p_project: project, p_chat: chat, p_revision: revision, p_avatar: avatar })
  return { avatar }
})
