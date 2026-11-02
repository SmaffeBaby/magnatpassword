import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readContractFiles(event), id = z.uuid().safeParse(getRouterParam(event, 'fileId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректный файл' })
  const file = current.files.find(row => row.id === id.data)
  if (!file) throw createError({ statusCode: 404, message: 'Файл не найден' })
  const { data, error } = await current.context.client.storage.from(contractFileBucket).download(contractFilePath(current.project, current.contract, file.id))
  if (error || !data) throw createError({ statusCode: 404, message: 'Файл недоступен' })
  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
  return Buffer.from(await data.arrayBuffer())
})
