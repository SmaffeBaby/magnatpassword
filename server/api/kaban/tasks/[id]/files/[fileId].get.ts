import { readKabanFiles, kabanId, kabanBucket } from '../../../../../utils/kaban'
export default defineEventHandler(async event => {
  const current = await readKabanFiles(event), id = kabanId(event, 'fileId'), file = current.files.find(file => file.id === id)
  if (!file) throw createError({ statusCode: 404, message: 'Файл не найден.' })
  const { data, error } = await current.context.client.storage.from(kabanBucket).download(`${current.task}/${id}`)
  if (error || !data) throw createError({ statusCode: 404, message: 'Файл недоступен.' })
  const inline = getQuery(event).preview === '1' && ['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)
  setHeader(event, 'Content-Type', inline ? file.type : 'application/octet-stream')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
  return Buffer.from(await data.arrayBuffer())
})
