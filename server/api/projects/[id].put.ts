import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), id = projectId(event)
  const body = await sharedBody(event, projectNameSchema.extend({ revision: z.number().int().positive() }))
  return mutateProject(context, 'rename', id, body.revision, { name: body.name })
})
