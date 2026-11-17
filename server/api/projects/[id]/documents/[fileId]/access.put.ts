import { documentAccessSchema } from '../../../../../../shared/utils/project-documents'
export default defineEventHandler(async event => {
  const id = projectDocumentId(event), current = await readProjectDocuments(event, id)
  const { revision, ...body } = await sharedBody(event, documentAccessSchema)
  await mutateProjectDocument(current.context, current.project, id, revision, 'access', body)
  return { ok: true }
})
