import { randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const id = projectDocumentId(event), current = await readProjectDocuments(event, id), file = current.files[0]!
  const body = await sharedBody(event, z.object({ action: z.enum(['copy','move']), folderId: z.uuid().nullable(), revision: z.number().int().positive() }).strict())
  if (body.revision !== file.revision) throw createError({ statusCode: 409, message: 'Файл изменился. Обновите список.' })
  if (body.action === 'move') {
    await mutateProjectDocument(current.context, current.project, id, body.revision, 'move', { folderId: body.folderId })
    return { id }
  }
  const permission = await current.context.client.rpc('project_section_permission', { p_actor: current.context.user.id, p_id: current.project, p_section: 'documents' })
  if (permission.error) documentFailure(permission.error)
  if (!['owner','editor'].includes(permission.data)) throw createError({ statusCode: 403, message: 'Нет прав на создание копии' })
  const { data, error } = await current.context.client.storage.from(projectDocumentBucket).download(current.rows[0]!.path)
  if (error || !data) throw createError({ statusCode: 404, message: 'Файл недоступен' })
  const metadata = { name: file.name, description: file.description, tags: file.tags, type: file.type, size: file.size }
  return storeProjectDocument(event, current, randomUUID(), metadata, Buffer.from(await data.arrayBuffer()), 0, 'create', { folderId: body.folderId, sourceId: id, sourceRevision: file.revision })
})
