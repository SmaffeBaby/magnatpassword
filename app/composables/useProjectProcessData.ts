import { useQuery } from '@tanstack/vue-query'
import type { ProjectProcess } from '~~/shared/types/project-process'
export function useProjectProcessData(projectId: MaybeRefOrGetter<string>) {
  const auth = useAuthStore()
  return useQuery({
    queryKey: computed(() => ['account', auth.user?.id, 'project-process-map', toValue(projectId)]),
    queryFn: ({ signal }) => sharedRequest<ProjectProcess>(`/api/projects/${toValue(projectId)}/process-map`, { signal }),
    enabled: computed(() => !!auth.user?.id && !!toValue(projectId)),
    retry: false,
    refetchInterval: 30000
  })
}
