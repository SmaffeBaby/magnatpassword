import { z } from 'zod'
import { assistantContext, assistantFetch } from '../../utils/assistant-context'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const parts = await readMultipartFormData(event)
  const value = (name: string) => parts?.find(part => part.name === name)?.data.toString()
  const selected = z.object({ targetId: z.string().min(1).max(256), projectId: z.uuid().optional(), vaultId: z.union([z.literal('personal'), z.uuid()]).optional() }).safeParse({ targetId: value('targetId'), projectId: value('projectId') || undefined, vaultId: value('vaultId') || undefined })
  if (!selected.success) throw createError({ statusCode: 400, message: 'Выберите место загрузки.' })
  const file = parts?.find(part => part.name === 'file')
  if (!file?.filename || !file.data.length || file.data.length > 20 * 1024 * 1024) throw createError({ statusCode: 400, message: 'Выберите непустой файл размером до 20 МБ.' })
  const context = await assistantContext(event, selected.data)
  const target = context.uploadTargets.find(target => target.id === selected.data.targetId)
  if (!target) throw createError({ statusCode: 403, message: 'Нет доступа к загрузке в выбранное место. Обновите список.' })
  const body = new FormData()
  body.append('file', new Blob([new Uint8Array(file.data)], { type: file.type || 'application/octet-stream' }), file.filename)
  let path: string
  if (target.kind === 'task') {
    path = `/api/kaban/tasks/${target.recordId}/files`
    if (target.blockId) body.append('blockId', target.blockId)
  } else if (target.kind === 'contract') path = `/api/projects/${target.projectId}/contracts/${target.recordId}/files`
  else {
    if (Number(value('revision')) !== target.revision) throw createError({ statusCode: 409, message: 'Входные данные изменились. Обновите список и повторите загрузку.' })
    path = `/api/projects/${target.projectId}/input-data/upload`
    body.append('cardId', target.recordId); body.append('revision', String(target.revision))
  }
  const multipart = new Request('http://localhost', { method: 'POST', body })
  const encoded = Buffer.from(await multipart.arrayBuffer())
  const result = await assistantFetch<any>(event, path, { method: 'POST', body: encoded, headers: { 'content-type': multipart.headers.get('content-type')! } })
  return { message: `Файл «${file.filename}» прикреплён: ${target.label}`, revision: result.revision }
})
