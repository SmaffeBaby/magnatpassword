import { z } from 'zod'
export default defineEventHandler(async event => {
  const { context, project, chat } = await projectChatContext(event), id = chatMessageId(event)
  const body = await sharedBody(event, z.discriminatedUnion('action', [
    z.object({ action: z.literal('pin'), value: z.boolean() }).strict(),
    z.object({ action: z.literal('vote'), itemId: z.uuid().nullable() }).strict(),
    z.object({ action: z.literal('todo'), itemId: z.uuid(), value: z.boolean() }).strict(),
    z.object({ action: z.literal('close-poll') }).strict()
  ]))
  await chatRpc(context, 'project_chat_interact', { p_project: project, p_chat: chat, p_message: id, p_action: body.action, p_item: 'itemId' in body ? body.itemId : null, p_value: 'value' in body ? body.value : false })
  return { ok: true }
})
