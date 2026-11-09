import { z } from 'zod'
import { kabanId, kabanFailure, kabanBucket } from '../../../utils/kaban'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), id = kabanId(event)
  const body = await sharedBody(event, z.object({ boardId: z.uuid(), revision: z.number().int().positive() }).strict())
  const { data, error } = await context.client.rpc('kaban_task_mutate', { p_actor: context.user.id, p_board: body.boardId, p_id: id, p_revision: body.revision, p_payload: {}, p_delete: true })
  if (error) kabanFailure(error)
  if (data.files.length) await context.client.storage.from(kabanBucket).remove(data.files.map((file: string) => `${id}/${file}`))
  return { ok: true }
})
