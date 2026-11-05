import { releasePlanSchema } from '../../../../shared/utils/release-plan'
export default defineEventHandler(async event => {
  const { client, user } = await requireSiteAdmin(event)
  const plan = await sharedBody(event, releasePlanSchema)
  const { error } = await client.from('app_release_plan').upsert({ id: true, ...plan, updated_at: new Date().toISOString(), updated_by: user.id })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось сохранить настройки релиза' })
  return { ok: true }
})
