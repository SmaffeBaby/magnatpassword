import type { Project } from '~~/shared/types/projects'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const { data, error } = await context.client.rpc('list_projects', { p_actor: context.user.id })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить проекты' })
  return (data ?? []) as Project[]
})
