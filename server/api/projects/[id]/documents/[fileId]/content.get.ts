import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event, projectDocumentId(event)), row = current.rows[0]!, file = current.files[0]!
  const value = getQuery(event).revision
  if (value !== undefined) {
    const revision = z.coerce.number().int().positive().safeParse(value)
    if (!revision.success) throw createError({ statusCode: 400, message: 'Некорректная версия файла' })
    if (revision.data !== row.revision) throw createError({ statusCode: 409, message: 'Файл изменился. Обновите список и откройте его заново.' })
  }
  const { data, error } = await current.context.client.storage.from(projectDocumentBucket).download(row.path)
  if (error || !data) throw createError({ statusCode: 404, message: 'Файл недоступен' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
  return Buffer.from(await data.arrayBuffer())
})
