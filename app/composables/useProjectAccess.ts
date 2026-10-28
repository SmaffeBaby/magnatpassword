import { useQuery } from '@tanstack/vue-query'
export function useProjectAccess() {
  const auth = useAuthStore(), vault = useVaultStore()
  return useQuery({
    queryKey: computed(() => ['account', auth.user?.id, 'projects-access']),
    queryFn: ({ signal }) => sharedRequest<{ allowed: boolean }>('/api/projects/access', { signal }),
    enabled: computed(() => !!auth.user && vault.unlocked),
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false
  })
}
