import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await projectChatContext(event)
  const body = await sharedBody(event, z.object({ fileId: z.uuid(), revision: revisionSchema }).strict())
  const documents = await readProjectDocuments(event, body.fileId), row = documents.rows[0]!, file = documents.files[0]!
  if (row.revision !== body.revision) throw createError({ statusCode: 409, message: 'Документ изменился. Обновите список.' })
  const downloaded = await current.context.client.storage.from(projectDocumentBucket).download(row.path)
  if (downloaded.error || !downloaded.data) throw createError({ statusCode: 404, message: 'Файл недоступен' })
  return storeChatFile(event, current, { name: file.name, type: file.type, size: file.size, description: file.description, tags: file.tags }, Buffer.from(await downloaded.data.arrayBuffer()), undefined, { id: file.id, revision: file.revision })
})
