export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { data, error } = await context.client.from('project_access').select('user_id').eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить доступ к проектам' })
  return { allowed: !!data }
})
