import type { ProjectDocumentChange } from '~~/shared/types/project-documents'

export default defineEventHandler(async (event): Promise<ProjectDocumentChange[]> => {
  const { client, user } = await requireProjectsUser(event)
  const { data, error } = await client.rpc('project_document_history_read', {
    p_actor: user.id, p_project: projectId(event), p_file: projectDocumentId(event)
  })
  if (error) documentFailure(error)
  return data ?? []
})
