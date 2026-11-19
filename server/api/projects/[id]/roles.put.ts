import { z } from 'zod'
import { projectRoleInputSchema } from '~~/shared/utils/project-permissions'

export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const id = projectId(event)
  const { revision, ...role } = await sharedBody(event, projectRoleInputSchema.extend({ revision: z.number().int().positive() }))
  return mutateProject(context, 'save_role', id, revision, role)
})
