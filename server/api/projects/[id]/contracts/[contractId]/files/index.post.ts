import { randomUUID } from 'node:crypto'
import { sealSharedVault } from '../../../../../../utils/shared-crypto'

export default defineEventHandler(async event => {
  const current = await readContractFiles(event, true)
  if (current.files.length >= 20) throw createError({ statusCode: 400, message: 'К договору можно прикрепить до 20 файлов' })
  const parts = await readMultipartFormData(event), file = parts?.find(part => part.name === 'file')
  if (!file?.filename || !file.data.length) throw createError({ statusCode: 400, message: 'Выберите непустой файл' })
  if (file.data.length > 20 * 1024 * 1024) throw createError({ statusCode: 413, message: 'Файл должен быть не больше 20 МБ' })
  const id = randomUUID(), path = contractFilePath(current.project, current.contract, id)
  const metadata = { id, name: file.filename.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 240), type: (file.type || 'application/octet-stream').slice(0, 120), size: file.data.length, createdAt: new Date().toISOString() }
  const { error: uploadError } = await current.context.client.storage.from(contractFileBucket).upload(path, file.data, { contentType: 'application/octet-stream', upsert: false })
  if (uploadError) throw createError({ statusCode: 503, message: 'Не удалось загрузить файл договора' })
  try {
    const { error } = await current.context.client.rpc('project_contract_files_access', { p_actor: current.context.user.id, p_project: current.project, p_contract: current.contract, p_write: true, p_file: id, p_data: sealSharedVault(metadata, sharedSecret(event), `contract-file:${current.project}:${current.contract}:${id}`, 1) })
    if (error) contractFileFailure(error)
    return metadata
  } catch (error) {
    await current.context.client.storage.from(contractFileBucket).remove([path])
    throw error
  }
})
