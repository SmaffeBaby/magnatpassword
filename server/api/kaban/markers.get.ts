import type { GanttMarker } from '~~/shared/utils/project-task-planning'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { data, error } = await context.client.rpc('kaban_gantt_markers_list', { p_actor: context.user.id })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить маркеры' })
  return data as GanttMarker[]
})
