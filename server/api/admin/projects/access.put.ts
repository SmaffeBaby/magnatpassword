import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSiteAdmin(event)
  const body = await sharedBody(event, z.object({ userId: z.uuid(), enabled: z.boolean() }).strict())
  const { error } = await context.client.rpc('set_project_access', { p_actor: context.user.id, p_user: body.userId, p_enabled: body.enabled })
  if (error) projectFailure(error)
  return { ok: true }
})
