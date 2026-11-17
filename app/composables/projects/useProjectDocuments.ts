import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ProjectDocument, ProjectDocumentFolder } from '~~/shared/types/project-documents'
export function useProjectDocuments(projectId: MaybeRefOrGetter<string>) {
  const auth = useAuthStore(), client = useQueryClient()
  const base = computed(() => `/api/projects/${toValue(projectId)}/documents`)
  const key = computed(() => ['account', auth.user?.id, 'project-documents', toValue(projectId)])
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => sharedRequest<ProjectDocument[]>(base.value, { signal }), enabled: computed(() => !!auth.user?.id && !!toValue(projectId)), retry: false, refetchInterval: 30000 })
  const folders = useQuery({ queryKey: computed(() => [...key.value, 'folders']), queryFn: ({ signal }) => sharedRequest<ProjectDocumentFolder[]>(`${base.value}/folders`, { signal }), enabled: computed(() => !!auth.user?.id && !!toValue(projectId)), retry: false, refetchInterval: 30000 })
  async function refresh() { await client.invalidateQueries({ queryKey: key.value }) }
  async function content(file: ProjectDocument) { return sharedRequest<Blob>(`${base.value}/${file.id}/content?revision=${file.revision}`, { responseType: 'blob' }) }
  return { query, folders, base, refresh, content }
}
