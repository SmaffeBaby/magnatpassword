import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import type { ProjectDocumentFolder } from '../../shared/types/project-documents'
import { openSharedVault, sealSharedVault } from './shared-crypto'
export async function readProjectDocumentFolders(event: H3Event, current: Awaited<ReturnType<typeof readProjectDocuments>>): Promise<ProjectDocumentFolder[]> {
  const { data, error } = await current.context.client.rpc('project_document_folders_read', { p_actor: current.context.user.id, p_project: current.project })
  if (error) documentFailure(error)
  return (data ?? []).map((row: any): ProjectDocumentFolder => ({ id: row.id, parentId: row.parentId, revision: row.revision, ...openSharedVault<{ name: string }>(row.encryptedData, sharedSecret(event), `project-folder:${current.project}:${row.id}`, 1) }))
}
export function projectFolderData(event: H3Event, project: string, id: string, name: string, parentId: string | null) {
  return { id, parentId, encryptedData: sealSharedVault({ name }, sharedSecret(event), `project-folder:${project}:${id}`, 1), nameKey: createHmac('sha256', Buffer.from(sharedSecret(event), 'base64')).update(`folder:${project}:${name.normalize('NFC').toLocaleLowerCase('ru')}`).digest('hex') }
}
export function documentFolderPath(folders: ProjectDocumentFolder[], id: string | null): ProjectDocumentFolder[] {
  const path: ProjectDocumentFolder[] = []
  while (id) {
    const folder = folders.find(f => f.id === id)
    if (!folder || path.some(f => f.id === id) || path.length >= 20) throw createError({ statusCode: 404, message: 'Папка не найдена' })
    path.unshift(folder); id = folder.parentId
  }
  return path
}
