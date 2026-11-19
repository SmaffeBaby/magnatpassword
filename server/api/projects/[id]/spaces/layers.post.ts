import { z } from 'zod'
import { spaceAssetContext } from '../../../../utils/space-assets'
import { projectFailure } from '../../../../utils/projects'

const coordinate = z.number().finite().min(-1e7).max(1e7)
const version = z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict()
const rank = z.number().int().min(1).max(1e9)
const changeSchema = version.extend({
  parentId: z.uuid().nullable().optional(),
  layerOrder: rank.optional(),
  layerHidden: z.boolean().optional(),
  x: coordinate.optional(), y: coordinate.optional()
}).strict().refine(change => Object.keys(change).length > 2)

const groupSchema = z.object({
  id: z.uuid(), parentId: z.uuid().nullable(), layerOrder: rank,
  x: coordinate, y: coordinate, width: z.number().min(160), height: z.number().min(100)
}).strict()

const bodySchema = z.object({
  changes: z.array(changeSchema).max(2000),
  group: groupSchema.optional(),
  remove: z.array(version).min(1).max(2000).optional()
}).strict().refine(body => !(body.group && body.remove) && (body.changes.length > 0 || !!body.remove))

export default defineEventHandler(async event => {
  const { changes, group, remove } = await sharedBody(event, bodySchema)
  const ids = [...changes, ...(remove ?? []), ...(group ? [group] : [])].map(item => item.id)
  if (new Set(ids).size !== ids.length) {
    throw createError({ statusCode: 400, message: 'Один слой указан несколько раз' })
  }
  const { context, project, space } = await spaceAssetContext(event, true)
  const args = { p_actor: context.user.id, p_project: project, p_space: space, p_changes: changes }
  const { error } = group || remove
    ? await context.client.rpc('space_layer_groups_write', { ...args, p_group: group ?? null, p_remove: remove ?? [] })
    : await context.client.rpc('space_layers_write', args)
  if (error?.message.includes('INVALID_SPACE_LAYER')) {
    throw createError({ statusCode: 400, message: 'Контур должен быть в этом пространстве. Вложение в себя или свой дочерний контур недоступно.' })
  }
  if (error) projectFailure(error)
  return { ok: true }
})
