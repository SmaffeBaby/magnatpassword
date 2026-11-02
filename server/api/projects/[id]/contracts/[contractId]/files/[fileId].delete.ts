import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readContractFiles(event, true), id = z.uuid().safeParse(getRouterParam(event, 'fileId'))
  if (!id.success) throw createError({ statusCode: 400, message: 'Некорректный файл' })
  if (!current.files.some(file => file.id === id.data)) throw createError({ statusCode: 404, message: 'Файл не найден' })
  const { error } = await current.context.client.rpc('project_contract_files_access', { p_actor: current.context.user.id, p_project: current.project, p_contract: current.contract, p_write: true, p_file: id.data, p_delete: true })
  if (error) contractFileFailure(error)
  const cleanup = await current.context.client.storage.from(contractFileBucket).remove([contractFilePath(current.project, current.contract, id.data)])
  if (cleanup.error) console.error('Contract attachment cleanup failed', cleanup.error.message)
  return { ok: true }
})
