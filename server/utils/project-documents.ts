import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ProjectDocument, ProjectDocumentMetadata } from '../../shared/types/project-documents'
import { documentMaxSize, documentMetadataSchema } from '../../shared/utils/project-documents'
import { openSharedVault, sealSharedVault } from './shared-crypto'
export const projectDocumentBucket = 'project-documents'
export type DocumentContext = Awaited<ReturnType<typeof requireProjectsUser>>
interface StoredDocument { folderId: string | null; id: string; encryptedData: unknown; path: string; revision: number; createdAt: string; updatedAt: string; createdBy: string | null; lastChangedBy?: string | null; permission: ProjectDocument['permission']; canManage: boolean; defaultPermission: ProjectDocument['defaultPermission']; members: ProjectDocument['members'] }
export function documentFailure(error: { message: string }): never {
  const folderErrors: Record<string, [number,string]> = { FOLDER_NOT_FOUND: [404,'Папка не найдена'], FOLDER_EXISTS: [409,'Папка с таким названием уже существует'], FOLDER_NOT_EMPTY: [409,'Сначала переместите или удалите содержимое папки'], FOLDER_LIMIT: [400,'В проекте можно создать до 500 папок'], FOLDER_DEPTH: [400,'Допускается до 20 уровней папок'] }
  for (const [code,[statusCode,message]] of Object.entries(folderErrors)) if (error.message.includes(code)) throw createError({ statusCode, message })
  if (error.message.includes('FILE_NOT_FOUND')) throw createError({ statusCode: 404, message: 'Файл не найден или недоступен' })
  if (error.message.includes('FILE_LIMIT')) throw createError({ statusCode: 400, message: 'В проекте можно сохранить до 500 файлов' })
  if (error.message.includes('INVALID_FILE')) throw createError({ statusCode: 400, message: 'Некорректный файл' })
  return projectFailure(error)
}
export function projectDocumentId(event: H3Event) {
  const result = z.uuid().safeParse(getRouterParam(event, 'fileId'))
  if (!result.success) throw createError({ statusCode: 400, message: 'Некорректный файл' })
  return result.data
}
export function decodeProjectDocument(event: H3Event, project: string, row: StoredDocument): ProjectDocument {
  const data = openSharedVault<ProjectDocumentMetadata>(row.encryptedData as Parameters<typeof openSharedVault>[0], sharedSecret(event), `project-document:${project}:${row.id}`, 1)
  return { ...data, folderId: row.folderId ?? null, id: row.id, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, createdBy: row.createdBy, lastChangedBy: row.lastChangedBy, permission: row.permission, canManage: row.canManage, defaultPermission: row.defaultPermission, members: row.members }
}
export async function readProjectDocuments(event: H3Event, file?: string) {
  const context = await requireProjectsUser(event), project = projectId(event)
  const { data, error } = await context.client.rpc('project_documents_read', { p_actor: context.user.id, p_project: project, p_file: file ?? null })
  if (error) documentFailure(error)
  const rows = (data ?? []) as StoredDocument[]
  return { context, project, rows, files: rows.map(row => decodeProjectDocument(event, project, row)) }
}
export async function mutateProjectDocument(context: DocumentContext, project: string, id: string, revision: number, action: string, data: Record<string, unknown>) {
  const result = await context.client.rpc('project_document_mutate', { p_actor: context.user.id, p_project: project, p_file: id, p_revision: revision, p_action: action, p_data: data })
  if (result.error) documentFailure(result.error)
}
export async function cleanupProjectDocuments(context: DocumentContext) {
  const { data, error } = await context.client.from('project_document_cleanup').select('path').order('created_at').limit(20)
  if (error || !data?.length) return
  const paths = data.map(row => row.path)
  const result = await context.client.storage.from(projectDocumentBucket).remove(paths)
  if (!result.error) await context.client.from('project_document_cleanup').delete().in('path', paths)
}
export async function uploadProjectDocument(event: H3Event, replace = false) {
  const id = replace ? projectDocumentId(event) : randomUUID()
  const current = await readProjectDocuments(event, replace ? id : undefined)
  if (replace && !['owner','editor'].includes(current.files[0]!.permission)) throw createError({ statusCode: 403, message: 'Нет прав на редактирование файла' })
  if (!replace) {
    const permission = await current.context.client.rpc('project_section_permission', { p_actor: current.context.user.id, p_id: current.project, p_section: 'documents' })
    if (permission.error) documentFailure(permission.error)
    if (!['owner','editor'].includes(permission.data)) throw createError({ statusCode: 403, message: 'Нет прав на загрузку файлов' })
  }
  const parts = await readMultipartFormData(event), file = parts?.find(part => part.name === 'file')
  const revision = replace ? z.coerce.number().int().positive().safeParse(parts?.find(part => part.name === 'revision')?.data.toString()) : { success: true as const, data: 0 }
  if (!revision.success) throw createError({ statusCode: 400, message: 'Укажите версию файла' })
  if (replace && current.files[0]!.revision !== revision.data) throw createError({ statusCode: 409, message: 'Файл изменён другим участником. Скачайте вашу копию и откройте актуальную версию.' })
  if (!file?.filename || !file.data.length) throw createError({ statusCode: 400, message: 'Выберите непустой файл' })
  if (file.data.length > documentMaxSize) throw createError({ statusCode: 413, message: 'Файл должен быть не больше 20 МБ' })
  const previous = replace ? current.files[0] : undefined
  const parsed = documentMetadataSchema.safeParse({ name: file.filename.replace(/[\x00-\x1f/\\]/g,'_').slice(0,240), description: previous?.description ?? '', tags: previous?.tags ?? [] })
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Некорректное имя файла' })
  const data: ProjectDocumentMetadata = { ...parsed.data, size: file.data.length, type: (file.type || 'application/octet-stream').slice(0,255) }
  const folderValue = parts?.find(part => part.name === 'folderId')?.data.toString()
  const folder = z.uuid().nullable().safeParse(folderValue || null)
  if (!folder.success) throw createError({ statusCode: 400, message: 'Некорректная папка' })
  return storeProjectDocument(event, current, id, data, file.data, revision.data, replace ? 'replace' : 'create', { folderId: folder.data })
}
export async function stageProjectDocument(event: H3Event, current: Awaited<ReturnType<typeof readProjectDocuments>>, id: string, metadata: ProjectDocumentMetadata, bytes: Buffer) {
  if (bytes.length > documentMaxSize) throw createError({ statusCode: 400, message: 'Размер файла превышает 20 МБ' })
  const path = `${current.project}/${id}/${randomUUID()}`
  const uploaded = await current.context.client.storage.from(projectDocumentBucket).upload(path, bytes, { contentType: 'application/octet-stream', upsert: false })
  if (uploaded.error) throw createError({ statusCode: 503, message: 'Не удалось загрузить файл в хранилище' })
  return { id, path, encryptedData: sealSharedVault(metadata, sharedSecret(event), `project-document:${current.project}:${id}`, 1) }
}
export async function discardProjectDocumentObjects(context: DocumentContext, paths: string[]) {
  if (!paths.length) return
  const removed = await context.client.storage.from(projectDocumentBucket).remove(paths)
  if (removed.error) await context.client.from('project_document_cleanup').upsert(paths.map(path => ({ path })))
}
export async function storeProjectDocument(event: H3Event, current: Awaited<ReturnType<typeof readProjectDocuments>>, id: string, metadata: ProjectDocumentMetadata, bytes: Buffer, revision = 0, action = 'create', extra: Record<string, unknown> = {}) {
  const staged = await stageProjectDocument(event, current, id, metadata, bytes)
  try { await mutateProjectDocument(current.context, current.project, id, revision, action, { ...staged, ...extra }) }
  catch (failure) { await discardProjectDocumentObjects(current.context, [staged.path]); throw failure }
  await cleanupProjectDocuments(current.context)
  return { id }
}
