import { useQuery } from '@tanstack/vue-query'
import type { Project } from '~~/shared/types/projects'

export function useProjectsData() {
  const auth = useAuthStore(), access = useProjectAccess()
  return useQuery({
    queryKey: computed(() => ['account', auth.user?.id, 'projects']),
    queryFn: ({ signal }) => sharedRequest<Project[]>('/api/projects', { signal }),
    enabled: computed(() => access.data.value?.allowed === true),
    refetchInterval: 30_000,
    retry: false
  })
}
