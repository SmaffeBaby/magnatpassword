import { z } from 'zod'
import { randomUUID } from 'node:crypto'

const groupBody = z.union([
  z.object({
    mode: z.enum(['copy', 'move', 'delete']),
    target: z.uuid().optional(),
    items: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive() })).min(1).max(500)
  }).strict(),
  z.object({ mode: z.literal('paste'), target: z.uuid(), ids: z.array(z.uuid()).min(1).max(500) }).strict()
])

export default defineEventHandler(async event => {
  const body = await sharedBody(event, groupBody)
  const { context, space, project } = await spaceAssetContext(event, body.mode === 'move' || body.mode === 'delete')
  const targetId = body.target
  const sameSpacePaste = body.mode === 'paste' && targetId === space

  if (body.mode !== 'delete') {
    const target = await context.client.from('project_spaces').select('project_id').eq('id', targetId ?? '00000000-0000-4000-8000-000000000000').maybeSingle()
    const rights = await context.client.rpc('space_permission', { p_actor: context.user.id, p_space: targetId })
    if (target.data?.project_id !== project || !['owner', 'editor'].includes(rights.data) || (targetId === space && !sameSpacePaste)) {
      throw createError({ statusCode: 403, message: 'Выберите доступное для редактирования пространство проекта' })
    }
  }

  const rows = await context.client.from('project_space_objects').select('*').eq('space_id', space)
  if (rows.error) throw createError({ statusCode: 503, message: 'Не удалось прочитать объекты' })
  const selected = new Set(body.mode === 'paste' ? body.ids : body.items.map(item => item.id))
  const byId = new Map(rows.data.map(row => [row.id, row]))
  const changed = body.mode === 'paste'
    ? body.ids.some(id => !byId.has(id))
    : body.items.some(item => byId.get(item.id)?.revision !== item.revision)
  if (changed) throw createError({ statusCode: 409, message: 'Объекты изменились. Обновите выбор' })

  const source = rows.data.filter(({ id, data }) => selected.has(id)
    || (data.kind === 'link' && selected.has(data.from) && selected.has(data.to)))
  if (body.mode !== 'delete' && !sameSpacePaste && source.some(({ data }) =>
    data.kind === 'link' && (!selected.has(data.from) || !selected.has(data.to)))) {
    throw createError({ statusCode: 400, message: 'Выберите оба объекта, соединённых связью' })
  }
  if (body.mode === 'paste' && source.length > 500) {
    throw createError({ statusCode: 400, message: 'За один раз можно вставить до 500 слоёв' })
  }

  const items = source.map(({ id, revision }) => ({ id, revision }))
  const mapping = new Map(source.map(({ id }) => [id, randomUUID()]))
  const copies = []
  const assets = []
  const paths: string[] = []
  const assetMapping = new Map<string, string>()
  try {
    if (body.mode !== 'delete') {
      for (const row of source) {
        const data = { ...row.data }
        if (data.parentId) data.parentId = mapping.get(data.parentId)
        if (data.from) data.from = mapping.get(data.from) ?? data.from
        if (data.to) data.to = mapping.get(data.to) ?? data.to
        if (sameSpacePaste) {
          data.x = Math.min(1e7, data.x + 30)
          data.y = Math.min(1e7, data.y + 30)
        }
        if (data.assetId && !sameSpacePaste) {
          if (!assetMapping.has(data.assetId)) {
            const original = await context.client.from('project_space_assets').select('*').eq('id', data.assetId).eq('space_id', space).single()
            if (original.error) throw createError({ statusCode: 404, message: 'Вложение недоступно' })
            const storage = context.client.storage.from(projectDocumentBucket)
            const blob = await storage.download(original.data.path)
            if (blob.error || !blob.data) throw createError({ statusCode: 404, message: 'Вложение недоступно' })
            const id = randomUUID()
            const path = `spaces/${project}/${targetId}/${id}`
            const bytes = await blob.data.arrayBuffer()
            const upload = await storage.upload(path, bytes, { contentType: 'application/octet-stream' })
            if (upload.error) throw upload.error
            paths.push(path)
            const metadata = openSharedVault(original.data.encrypted_data, sharedSecret(event), `space-asset:${space}:${data.assetId}`, 1)
            assets.push({ id, path, encrypted_data: sealSharedVault(metadata, sharedSecret(event), `space-asset:${targetId}:${id}`, 1) })
            assetMapping.set(data.assetId, id)
          }
          data.assetId = assetMapping.get(data.assetId)
        }
        copies.push({ id: mapping.get(row.id)!, data })
      }
    }

    const result = sameSpacePaste
      ? await context.client.rpc('space_append', {
          p_actor: context.user.id, p_project: project, p_space: space, p_objects: copies, p_assets: []
        })
      : await context.client.rpc('space_group', {
          p_actor: context.user.id, p_source: space, p_target: targetId ?? null,
          p_mode: body.mode === 'paste' ? 'copy' : body.mode, p_items: items, p_copies: copies, p_assets: assets
        })
    if (result.error) projectFailure(result.error)
    return { ids: copies.map(copy => copy.id) }
  } catch (error) {
    if (paths.length) await context.client.storage.from(projectDocumentBucket).remove(paths)
    throw error
  }
})
