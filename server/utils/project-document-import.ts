import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { documentMetadataSchema } from '../../shared/utils/project-documents'
export async function importProjectDocumentArchive(event: H3Event, current: Awaited<ReturnType<typeof readProjectDocuments>>, bytes: Buffer, folderId: string | null) {
  const permission = await current.context.client.rpc('project_section_permission', { p_actor: current.context.user.id, p_id: current.project, p_section: 'documents' })
  if (permission.error) documentFailure(permission.error)
  if (!['owner','editor'].includes(permission.data)) throw createError({ statusCode: 403, message: 'Нет прав на импорт файлов' })
  const folders = await readProjectDocumentFolders(event, current), base = documentFolderPath(folders, folderId)
  let entries: Awaited<ReturnType<typeof readDocumentArchive>>
  try { entries = await readDocumentArchive(bytes) } catch (error: any) { throw createError({ statusCode: 400, message: error.message || 'Не удалось прочитать ZIP' }) }
  let metadata = new Map<string, { name: string; description: string; tags: string[] }>()
  const manifest = entries.find(e => e.parts.length === 1 && e.parts[0] === '.magnat-documents.json' && e.bytes)
  if (manifest?.bytes) {
    try {
      const data = JSON.parse(manifest.bytes.toString())
      if (data.format === 'magnat-project-documents-v1' && Array.isArray(data.files)) {
        metadata = new Map(data.files.map((file: any) => [String(file.path), documentMetadataSchema.parse({ name: file.name, description: file.description, tags: file.tags })]))
        entries = entries.filter(e => e !== manifest)
      }
    } catch { /* An unrelated JSON file is imported as an ordinary file. */ }
  }
  if (!entries.length) throw createError({ statusCode: 400, message: 'Архив не содержит файлов или папок' })
  if (entries.some(e => base.length + e.parts.length > (e.bytes === undefined ? 20 : 21))) throw createError({ statusCode: 400, message: 'Путь превышает 20 уровней папок' })
  const createdFolders: ReturnType<typeof projectFolderData>[] = [], files: (Awaited<ReturnType<typeof stageProjectDocument>> & { folderId: string | null })[] = []
  const folderMap = new Map(folders.map(f => [`${f.parentId ?? ''}/${f.name.normalize('NFC').toLocaleLowerCase('ru')}`, f.id]))
  try {
    for (const entry of entries) {
      let parent = folderId
      const names = entry.bytes === undefined ? entry.parts : entry.parts.slice(0, -1)
      for (const name of names) {
        const key = `${parent ?? ''}/${name.normalize('NFC').toLocaleLowerCase('ru')}`
        let id = folderMap.get(key)
        if (!id) { id = randomUUID(); folderMap.set(key, id); createdFolders.push(projectFolderData(event, current.project, id, name, parent)) }
        parent = id
      }
      if (entry.bytes !== undefined) {
        const stored = metadata.get(entry.parts.join('/'))
        const data = { name: stored?.name ?? entry.parts.at(-1)!, description: stored?.description ?? '', tags: stored?.tags ?? [], type: 'application/octet-stream', size: entry.bytes.length }
        files.push({ ...await stageProjectDocument(event, current, randomUUID(), data, entry.bytes), folderId: parent })
      }
    }
    const result = await current.context.client.rpc('project_document_import', { p_actor: current.context.user.id, p_project: current.project, p_folders: createdFolders, p_files: files })
    if (result.error) documentFailure(result.error)
  } catch (error) { await discardProjectDocumentObjects(current.context, files.map(f => f.path)); throw error }
  return { files: files.length, folders: createdFolders.length }
}
