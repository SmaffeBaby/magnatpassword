import { z } from 'zod'
import { projectPermissionSchema, projectRoleIdSchema, projectSectionPermissionsSchema } from '~~/shared/utils/project-permissions'
const member = z.object({ userId: z.uuid(), revision: z.number().int().positive() }).strict()
const memberUpdate = z.union([
  member.extend({ roleId: projectRoleIdSchema }),
  member.extend({ permission: projectPermissionSchema, sections: projectSectionPermissionsSchema.optional(), kind: z.enum(['executor', 'observer']).optional() })
])
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), id = projectId(event)
  const body = await sharedBody(event, memberUpdate)
  const { revision, ...payload } = body
  return mutateProject(context, 'roleId' in payload ? 'assign_role' : 'member', id, revision, payload)
})
