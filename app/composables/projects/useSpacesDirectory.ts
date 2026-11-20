import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'

interface DirectorySpace {
  id: string
  name: string
  description: string
  updated_at: string
  object_count: number
  permission: string
}

interface DirectoryProject {
  id: string
  name: string
  spaces: DirectorySpace[]
}

export function useSpacesDirectory(enabled: MaybeRefOrGetter<boolean> = true) {
  const auth = useAuthStore()
  return useQuery({
    queryKey: computed(() => ['account', auth.user?.id, 'spaces-directory']),
    queryFn: () => sharedRequest<DirectoryProject[]>('/api/spaces'),
    enabled: computed(() => toValue(enabled)),
    retry: false,
    refetchInterval: 30000
  })
}
