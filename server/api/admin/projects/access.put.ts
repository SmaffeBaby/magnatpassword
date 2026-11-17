import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSiteAdmin(event)
  const body = await sharedBody(event, z.object({ userId: z.uuid(), enabled: z.boolean() }).strict())
  if (!body.enabled) throw createError({ statusCode: 409, message: 'Раздел «Проекты» доступен всем. Права участников настраивает владелец внутри проекта.' })
  const { error } = await context.client.rpc('set_project_access', { p_actor: context.user.id, p_user: body.userId, p_enabled: body.enabled })
  if (error) projectFailure(error)
  return { ok: true }
})
