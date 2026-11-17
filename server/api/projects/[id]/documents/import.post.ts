import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event), parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file'), folderId = z.uuid().nullable().safeParse(parts?.find(p => p.name === 'folderId')?.data.toString() || null)
  if (!folderId.success || !file?.filename?.toLowerCase().endsWith('.zip')) throw createError({ statusCode: 400, message: 'Выберите ZIP-архив и папку назначения' })
  return importProjectDocumentArchive(event, current, file.data, folderId.data)
})
