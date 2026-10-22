import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedMember(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, name: z.string().trim().min(1).max(80) }).strict())
  return mutateShared(context, 'rename', context.id, body.revision, { name: body.name })
})
