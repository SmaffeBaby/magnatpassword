import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { documentMetadataSchema } from '../../../../../shared/utils/project-documents'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event)
  const body = await sharedBody(event, z.object({ kind: z.enum(['wordcraft','pdfcraft','gridcraft','deckcraft','photocraft']), name: documentMetadataSchema.shape.name, folderId: z.uuid().nullable() }).strict())
  const permission = await current.context.client.rpc('project_section_permission', { p_actor: current.context.user.id, p_id: current.project, p_section: 'documents' })
  if (permission.error) documentFailure(permission.error)
  if (!['owner','editor'].includes(permission.data)) throw createError({ statusCode: 403, message: 'Нет прав на создание файлов' })
  const extension = projectDocumentTemplateExtensions[body.kind], name = body.name.toLowerCase().endsWith(`.${extension}`) ? body.name : `${body.name}.${extension}`
  if (name.length > 240) throw createError({ statusCode: 400, message: 'Название файла слишком длинное' })
  const bytes = await projectDocumentTemplate(body.kind)
  return storeProjectDocument(event, current, randomUUID(), { name, size: bytes.length, type: 'application/octet-stream', description: '', tags: [] }, bytes, 0, 'create', { folderId: body.folderId })
})
