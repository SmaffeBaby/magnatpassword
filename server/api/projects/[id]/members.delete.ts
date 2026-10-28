import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), id = projectId(event)
  const body = await sharedBody(event, z.object({ userId: z.uuid(), revision: z.number().int().positive() }).strict())
  return mutateProject(context, 'remove_member', id, body.revision, { userId: body.userId })
})
