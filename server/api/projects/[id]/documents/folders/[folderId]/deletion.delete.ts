import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event), id = z.uuid().safeParse(getRouterParam(event, 'folderId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректная папка' })
  const body = await sharedBody(event, z.object({ revision: z.number().int().positive(), token: z.string().regex(/^[0-9a-f]{32}$/) }).strict())
  const result = await current.context.client.rpc('project_document_folder_mutate', { p_actor: current.context.user.id, p_project: current.project, p_folder: id.data, p_revision: body.revision, p_action: 'delete-tree', p_data: { token: body.token } })
  if (result.error?.message.includes('REVISION_CONFLICT')) throw createError({ statusCode: 409, message: 'Содержимое папки изменилось. Обновите информацию и подтвердите удаление заново.' })
  if (result.error) documentFailure(result.error)
  await cleanupProjectDocuments(current.context)
  return result.data as { filesCount: number; foldersCount: number }
})
