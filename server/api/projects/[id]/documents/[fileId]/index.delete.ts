import { z } from 'zod'
export default defineEventHandler(async event => {
  const id = projectDocumentId(event), current = await readProjectDocuments(event, id)
  const body = await sharedBody(event, z.object({ revision: z.number().int().positive() }).strict())
  await mutateProjectDocument(current.context, current.project, id, body.revision, 'delete', {})
  await cleanupProjectDocuments(current.context)
  return { ok: true }
})
