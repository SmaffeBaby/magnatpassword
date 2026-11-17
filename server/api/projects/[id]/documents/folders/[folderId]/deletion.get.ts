import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event), id = z.uuid().safeParse(getRouterParam(event, 'folderId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректная папка' })
  const result = await current.context.client.rpc('project_document_folder_delete_plan', { p_actor: current.context.user.id, p_project: current.project, p_folder: id.data })
  if (result.error) documentFailure(result.error)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return result.data as { filesCount: number; foldersCount: number; token: string }
})
