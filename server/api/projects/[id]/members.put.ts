import { z } from 'zod'
import { projectSectionPermissionsSchema } from '~~/shared/utils/project-permissions'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), id = projectId(event)
  const body = await sharedBody(event, z.object({ userId: z.uuid(), permission: z.enum(['viewer','editor','hidden']), sections: projectSectionPermissionsSchema.optional(), kind:z.enum(['executor','observer']).optional(), revision: z.number().int().positive() }).strict())
  const { revision, ...payload } = body
  return mutateProject(context, 'member', id, revision, payload)
})
