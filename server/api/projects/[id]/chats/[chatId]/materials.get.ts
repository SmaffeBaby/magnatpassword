import { z } from 'zod'
import type { ChatMaterial, ChatMaterialPage, ChatMaterialTab } from '../../../../../../shared/types/project-chats'

const requestQuery = z.object({
  tab: z.enum(['media', 'files', 'links', 'gifs']),
  q: z.string().trim().max(200).default(''),
  before: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()
})
function fileTab(type: string): ChatMaterialTab {
  if (type === 'image/gif') return 'gifs'
  return type.startsWith('image/') || type.startsWith('video/') ? 'media' : 'files'
}

export default defineEventHandler(async (event): Promise<ChatMaterialPage> => {
  const current = await projectChatContext(event)
  const query = requestQuery.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, message: 'Некорректный поиск материалов' })
  const { context, project, chat } = current
  const { tab, q, before } = query.data
  const tokens = q.normalize('NFKC').toLocaleLowerCase('ru').split(/\s+/).filter(Boolean)
  const matches = (value: string) => {
    const normalized = value.normalize('NFKC').toLocaleLowerCase('ru')
    return tokens.every(token => normalized.includes(token))
  }
  let cursor = before ?? null
  for (let page = 0; page < 8; page++) {
    const result = await chatRpc(context, 'project_chat_feed', { p_project: project, p_chat: chat, p_before: cursor })
    const items: ChatMaterial[] = []
    for (const row of [...result.messages].reverse()) {
      if (row.deletedAt) continue
      if (tab === 'links') {
        const { text } = decodeChatContent(event, project, chat, row.id, row.encryptedData)
        const urls = new Set((text.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map(link => link.replace(/[.,!?;:\])}]+$/, '')))
        for (const url of urls) if (matches(url)) items.push({ seq: row.seq, url })
      } else if (row.files.length) {
        const caption = q ? decodeChatContent(event, project, chat, row.id, row.encryptedData).text : ''
        for (const stored of row.files) {
          const file = decodeChatFile(event, project, chat, stored, context.user.id)
          if (fileTab(file.type) === tab && matches(`${file.name} ${caption}`)) items.push({ seq: row.seq, file })
        }
      }
    }
    cursor = result.nextBefore
    if (items.length || !cursor) return { items, nextBefore: cursor }
  }
  return { items: [], nextBefore: cursor }
})
