import { z } from 'zod'
export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event), folders = await readProjectDocumentFolders(event, current)
  const body = await sharedBody(event, z.object({ folderId: z.uuid().nullable(), fileIds: z.array(z.uuid()).max(500).optional() }).strict())
  const base = documentFolderPath(folders, body.folderId)
  if (body.fileIds?.some(id => !current.files.some(f => f.id === id))) throw createError({ statusCode: 404, message: 'Файл не найден или недоступен' })
  const tree = new Set(folders.filter(f => body.folderId === null || documentFolderPath(folders, f.id).some(p => p.id === body.folderId)).map(f => f.id))
  const files = current.files.filter(f => body.fileIds ? body.fileIds.includes(f.id) : f.folderId === body.folderId || (f.folderId && tree.has(f.folderId)))
  if (files.reduce((sum, f) => sum + f.size, 0) > documentArchiveMaxSize) throw createError({ statusCode: 413, message: 'Экспортируйте папку меньшего размера: до 100 МБ за один раз' })
  const entries: { path: string; bytes?: Buffer }[] = [], used = new Set<string>(['.magnat-documents.json']), manifest: object[] = []
  if (!body.fileIds) for (const folder of folders.filter(f => tree.has(f.id) && f.id !== body.folderId)) { const path = documentFolderPath(folders, folder.id).slice(base.length).map(f => f.name).join('/'); entries.push({ path }); used.add(path) }
  let total = 0
  for (const file of files) {
    const parent = documentFolderPath(folders, file.folderId).slice(body.fileIds ? 0 : base.length).map(f => f.name).join('/')
    let path = (parent ? parent + '/' : '') + file.name, suffix = 1
    while (used.has(path)) path = (parent ? parent + '/' : '') + `${suffix++} — ${file.name}`
    used.add(path)
    const { data, error } = await current.context.client.storage.from(projectDocumentBucket).download(current.rows.find(r => r.id === file.id)!.path)
    if (error || !data) throw createError({ statusCode: 503, message: `Не удалось прочитать файл: ${file.name}` })
    const bytes = Buffer.from(await data.arrayBuffer()); total += bytes.length
    if (total > documentArchiveMaxSize) throw createError({ statusCode: 413, message: 'Размер экспорта превышает 100 МБ' })
    entries.push({ path, bytes }); manifest.push({ path, name: file.name, description: file.description, tags: file.tags })
  }
  entries.push({ path: '.magnat-documents.json', bytes: Buffer.from(JSON.stringify({ format: 'magnat-project-documents-v1', files: manifest })) })
  setHeaders(event, { 'Content-Type': 'application/zip', 'Content-Disposition': "attachment; filename*=UTF-8''project-documents.zip", 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  const archive = await writeDocumentArchive(entries)
  if (archive.length > documentArchiveMaxSize) throw createError({ statusCode: 413, message: 'ZIP больше 100 МБ. Экспортируйте документы по папкам.' })
  return archive
})
