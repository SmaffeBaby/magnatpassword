import { z } from 'zod'
import { kabanId, kabanFailure, kabanStagesSchema } from '../../../../utils/kaban'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), id = kabanId(event)
  const body = await sharedBody(event, z.object({ revision: z.number().int().positive(), categoryId: z.string().min(1).max(128).optional(), inherit: z.boolean().optional(), stages: kabanStagesSchema }).strict())
  const { error } = body.categoryId ? await context.client.rpc('kaban_category_stages_write', { p_actor: context.user.id, p_board: id, p_category: body.categoryId, p_revision: body.revision, p_stages: body.stages, p_inherit: body.inherit || false }) : await context.client.rpc('kaban_stages', { p_actor: context.user.id, p_board: id, p_revision: body.revision, p_stages: body.stages })
  if (error) kabanFailure(error)
  return { ok: true }
})
