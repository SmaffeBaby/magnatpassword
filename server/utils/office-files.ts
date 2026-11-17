import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import type { OfficeSource, OfficeFile } from '../../shared/types/office'
import { officeSourceSchema } from '../../shared/utils/office'
import { sealSharedVault } from './shared-crypto'
export function parseOfficeSource(value: unknown): OfficeSource {
  try { return officeSourceSchema.parse(typeof value === 'string' ? JSON.parse(value) : value) }
  catch { throw createError({ statusCode: 400, message: 'Некорректный источник файла' }) }
}
export async function readOfficeFile(event: H3Event, source: OfficeSource, write = false) {
  const previous = event.context.params
  event.context.params = { id: source.kind === 'task' || source.kind === 'registry' ? source.recordId! : source.projectId!, contractId: source.recordId!, fileId: source.fileId, origin: 'standalone' }
  try {
    let current: any, file: any, bucket = '', path = '', encryptedData: any, encryptionId = ''
    if (source.kind === 'document') {
      current = await readProjectDocuments(event, source.fileId); file = current.files[0]
      if (write && !['owner','editor'].includes(file.permission)) throw createError({ statusCode: 403, message: 'Нет прав на изменение файла' })
      bucket = projectDocumentBucket; path = current.rows[0].path
    } else if (source.kind === 'input') {
      current = await readProjectInputs(event, write)
      file = current.state.cards.flatMap((c: any) => c.attachments).find((f: any) => f.id === source.fileId)
      bucket = inputBucket; path = file?.path
    } else {
      let table = ''
      if (source.kind === 'task') { current = await readKabanFiles(event, write); bucket = kabanBucket; table = 'kaban_files'; encryptionId = `kaban-file:${source.recordId}:${source.fileId}` }
      else if (source.kind === 'contract') { current = await readContractFiles(event, write); bucket = contractFileBucket; table = 'project_contract_files'; encryptionId = `contract-file:${source.projectId}:${source.recordId}:${source.fileId}` }
      else { current = await registryFiles(event, write); bucket = registryBucket; table = 'registry_contract_files'; encryptionId = `registry-file:${source.recordId}:${source.fileId}` }
      file = current.files.find((f: any) => f.id === source.fileId && (source.kind !== 'registry' || f.origin === 'standalone' && f.contractId === source.recordId))
      if (file) {
        const row = await current.context.client.from(table).select('encrypted_data').eq('id', source.fileId).single()
        if (row.error) throw createError({ statusCode: 404, message: 'Файл недоступен' })
        encryptedData = row.data.encrypted_data
        path = source.kind === 'contract' ? contractFilePath(source.projectId!, source.recordId!, source.fileId) : `${source.recordId}/${source.fileId}`
      }
    }
    if (!file) throw createError({ statusCode: 404, message: 'Файл не найден или недоступен' })
    const token = createHash('sha256').update(JSON.stringify([source, file, current.state?.revision ?? null])).digest('hex')
    return { current, context: current.context, file, bucket, path, encryptedData, encryptionId, token }
  } finally { event.context.params = previous }
}
export async function officeFileInfo(event: H3Event, source: OfficeSource): Promise<OfficeFile> {
  const result = await readOfficeFile(event, source)
  let canEdit = true
  try { await readOfficeFile(event, source, true) } catch (error: any) { if ([403,404].includes(error.statusCode)) canEdit = false; else throw error }
  return { source, name: result.file.name, type: result.file.type, size: result.file.size, token: result.token, canEdit }
}
export async function replaceOfficeFile(event: H3Event, source: OfficeSource, token: string, bytes: Buffer, name: string, type: string) {
  const read = await readOfficeFile(event, source, true)
  if (token !== read.token) throw createError({ statusCode: 409, message: 'Файл изменился. Сохраните вашу копию и откройте актуальную версию.' })
  const id = randomUUID(), metadata = { ...read.file, id, name, type, size: bytes.length, createdAt: new Date().toISOString() }
  let path: string
  if (source.kind === 'document') {
    const data = { name, type, size: bytes.length, description: read.file.description, tags: read.file.tags }
    await storeProjectDocument(event, read.current, source.fileId, data, bytes, read.file.revision, 'replace')
    return officeFileInfo(event, source)
  }
  const card = source.kind === 'input' ? read.current.state.cards.find((c: any) => c.attachments.some((a: any) => a.id === source.fileId)) : null
  path = source.kind === 'input' ? `${source.projectId}/${card.id}/${id}` : source.kind === 'contract' ? contractFilePath(source.projectId!, source.recordId!, id) : `${source.recordId}/${id}`
  const uploaded = await read.context.client.storage.from(read.bucket).upload(path, bytes, { upsert: false, contentType: 'application/octet-stream' })
  if (uploaded.error) throw createError({ statusCode: 503, message: 'Не удалось сохранить файл в хранилище' })
  try {
    if (card) {
      await saveProjectInputs(event, read.current, read.current.state.revision, read.current.state.cards.map((c: any) => c.id !== card.id ? c : { ...c, updatedAt: metadata.createdAt, attachments: c.attachments.map((a: any) => a.id === source.fileId ? { ...metadata, path } : a) }))
    } else {
      const encryptionId = read.encryptionId.slice(0, read.encryptionId.lastIndexOf(':') + 1) + id
      const result = await read.context.client.rpc('office_attachment_replace', { p_actor: read.context.user.id, p_kind: source.kind, p_project: source.projectId ?? null, p_record: source.recordId, p_file: source.fileId, p_expected: read.encryptedData, p_new_file: id, p_data: sealSharedVault(metadata, sharedSecret(event), encryptionId, 1) })
      if (result.error) documentFailure(result.error)
    }
  } catch (error) { await read.context.client.storage.from(read.bucket).remove([path]); throw error }
  await read.context.client.storage.from(read.bucket).remove([read.path])
  return officeFileInfo(event, { ...source, fileId: id })
}
