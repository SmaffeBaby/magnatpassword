import { documentMetadataSchema, documentMaxSize } from '../../../shared/utils/project-documents'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const parts = await readMultipartFormData(event), source = parseOfficeSource(parts?.find(p => p.name === 'source')?.data.toString())
  const file = parts?.find(p => p.name === 'file'), token = parts?.find(p => p.name === 'token')?.data.toString()
  if (!file?.filename || !file.data.length || !token) throw createError({ statusCode: 400, message: 'Выберите непустой файл и его версию' })
  if (file.data.length > documentMaxSize) throw createError({ statusCode: 413, message: 'Файл должен быть до 20 МБ' })
  const name = documentMetadataSchema.shape.name.safeParse(file.filename)
  if (!name.success) throw createError({ statusCode: 400, message: 'Некорректное название файла' })
  return replaceOfficeFile(event, source, token, file.data, name.data, file.type || 'application/octet-stream')
})
