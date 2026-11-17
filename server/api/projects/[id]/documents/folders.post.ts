import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { documentMetadataSchema } from '../../../../../shared/utils/project-documents'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event)
  const body = await sharedBody(event, z.object({ action: z.enum(['create','rename','delete']), id: z.uuid().optional(), revision: z.number().int().positive().optional(), parentId: z.uuid().nullable().default(null), name: documentMetadataSchema.shape.name.optional() }).strict())
  if (body.action !== 'create' && (!body.id || !body.revision)) throw createError({ statusCode: 400, message: 'Укажите папку и версию' })
  if (body.action !== 'delete' && !body.name) throw createError({ statusCode: 400, message: 'Укажите название папки' })
  const id = body.action === 'create' ? randomUUID() : body.id!
  const result = await current.context.client.rpc('project_document_folder_mutate', { p_actor: current.context.user.id, p_project: current.project, p_folder: id, p_revision: body.action === 'create' ? 0 : body.revision, p_action: body.action, p_data: body.action === 'delete' ? {} : projectFolderData(event, current.project, id, body.name!, body.parentId) })
  if (result.error) documentFailure(result.error)
  return { id }
})
