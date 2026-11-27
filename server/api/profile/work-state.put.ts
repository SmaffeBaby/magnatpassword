import { profileWorkStateSchema, teamProfile } from '../../utils/team'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, profileWorkStateSchema)
  const { data, error } = await context.client.from('team_profiles')
    .update({ work_status: body.status, workload: body.workload, mood: body.mood, updated_at: new Date().toISOString() })
    .eq('user_id', context.user.id)
    .select('user_id')
    .single()

  if (error || !data) throw createError({ statusCode: 503, message: 'Не удалось сохранить рабочее состояние' })
  return teamProfile(event, context, context.user.id)
})
