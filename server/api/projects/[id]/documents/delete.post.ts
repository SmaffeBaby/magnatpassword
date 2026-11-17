import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event)
  const body = await sharedBody(event, z.object({
    files: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict()).max(500).default([]),
    folders: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive(), token: z.string().regex(/^[0-9a-f]{32}$/) }).strict()).max(500).default([])
  }).strict().refine(value => value.files.length + value.folders.length > 0 && new Set(value.files.map(f => f.id)).size === value.files.length && new Set(value.folders.map(f => f.id)).size === value.folders.length))
  const result = await current.context.client.rpc('project_document_selection_delete', { p_actor: current.context.user.id, p_project: current.project, p_files: body.files, p_folders: body.folders })
  if (result.error?.message.includes('REVISION_CONFLICT')) throw createError({ statusCode: 409, message: 'Выбранные файлы или содержимое папок изменились. Проверьте список и подтвердите удаление заново.' })
  if (result.error) documentFailure(result.error)
  await cleanupProjectDocuments(current.context)
  return result.data as { deleted: number; deletedFolders: number }
})
