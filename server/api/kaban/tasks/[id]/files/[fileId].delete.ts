import { readKabanFiles, kabanId, kabanFailure, kabanBucket } from '../../../../../utils/kaban'
export default defineEventHandler(async event => {
  const current = await readKabanFiles(event, true), id = kabanId(event, 'fileId')
  const { error } = await current.context.client.rpc('kaban_files_access', { p_actor: current.context.user.id, p_task: current.task, p_write: true, p_file: id, p_delete: true })
  if (error) kabanFailure(error)
  await current.context.client.storage.from(kabanBucket).remove([`${current.task}/${id}`])
  return { ok: true }
})
