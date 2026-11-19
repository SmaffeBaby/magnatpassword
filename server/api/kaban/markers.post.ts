import { z } from 'zod'
import type { GanttMarker } from '~~/shared/utils/project-task-planning'
import { validDate } from '~~/shared/utils/subscriptions'
import { projectFailure } from '../../utils/projects'

const project = z.object({ projectId: z.uuid() })
const marker = z.object({ id: z.uuid(), revision: z.number().int().positive() })
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  day: z.string().refine(validDate),
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
})
const bodySchema = z.discriminatedUnion('action', [
  project.extend({ action: z.literal('create'), ...fields.shape }).strict(),
  project.extend({ action: z.literal('update'), ...marker.shape, ...fields.shape }).strict(),
  project.extend({ action: z.literal('delete'), ...marker.shape }).strict()
])

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, bodySchema)
  const { data, error } = await context.client.rpc('kaban_gantt_marker_mutate', {
    p_actor: context.user.id,
    p_project: body.projectId,
    p_action: body.action,
    p_marker: 'id' in body ? body.id : null,
    p_revision: 'revision' in body ? body.revision : null,
    p_day: body.action === 'delete' ? null : body.day,
    p_title: body.action === 'delete' ? null : body.title,
    p_color: body.action === 'delete' ? null : body.color
  })
  if (error) projectFailure(error)
  return data as GanttMarker
})
