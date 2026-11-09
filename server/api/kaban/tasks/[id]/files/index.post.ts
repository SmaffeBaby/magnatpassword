import { randomUUID } from 'node:crypto'
import { readKabanFiles, kabanFailure, kabanBucket, kabanImageType } from '../../../../../utils/kaban'
import { sealSharedVault } from '../../../../../utils/shared-crypto'
import { kabanFileLimit } from '../../../../../../shared/utils/kaban'
export default defineEventHandler(async event => {
  const current = await readKabanFiles(event, true)
  if (current.files.length >= 20) throw createError({ statusCode: 400, message: 'К задаче можно прикрепить до 20 файлов.' })
  const parts = await readMultipartFormData(event), file = parts?.find(part => part.name === 'file')
  if (!file?.filename || !file.data.length) throw createError({ statusCode: 400, message: 'Выберите непустой файл.' })
  if (file.data.length > kabanFileLimit) throw createError({ statusCode: 413, message: 'Максимальный размер файла — 20 МБ.' })
  const id = randomUUID(), path = `${current.task}/${id}`
  const metadata = { id, name: file.filename.replace(/[\x00-\x1f/\\]/g, '_').slice(0,240), type: kabanImageType(file.data) || 'application/octet-stream', size: file.data.length, createdAt: new Date().toISOString() }
  const uploaded = await current.context.client.storage.from(kabanBucket).upload(path, file.data, { contentType: 'application/octet-stream', upsert: false })
  if (uploaded.error) throw createError({ statusCode: 503, message: 'Не удалось загрузить файл.' })
  try {
    const { error } = await current.context.client.rpc('kaban_files_access', { p_actor: current.context.user.id, p_task: current.task, p_write: true, p_file: id, p_data: sealSharedVault(metadata, sharedSecret(event), `kaban-file:${current.task}:${id}`, 1) })
    if (error) kabanFailure(error)
    return metadata
  } catch (error) { await current.context.client.storage.from(kabanBucket).remove([path]); throw error }
})
