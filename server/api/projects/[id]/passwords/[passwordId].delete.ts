import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), project = projectId(event), id = projectPasswordId(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema }).strict())
  return mutateProjectPassword(context, project, id, body.revision, 'delete')
})
