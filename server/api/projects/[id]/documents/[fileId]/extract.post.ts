import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event, projectDocumentId(event)), file = current.files[0]!
  const body = await sharedBody(event, z.object({ folderId: z.uuid().nullable(), revision: z.number().int().positive() }).strict())
  if (!file.name.toLowerCase().endsWith('.zip')) throw createError({ statusCode: 400, message: 'Распаковка доступна для ZIP' })
  if (body.revision !== file.revision) throw createError({ statusCode: 409, message: 'Архив изменился. Обновите список.' })
  const { data, error } = await current.context.client.storage.from(projectDocumentBucket).download(current.rows[0]!.path)
  if (error || !data) throw createError({ statusCode: 404, message: 'Архив недоступен' })
  return importProjectDocumentArchive(event, current, Buffer.from(await data.arrayBuffer()), body.folderId)
})
