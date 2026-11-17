import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { EstimateContent, ProjectEstimate } from '~~/shared/types/estimate'
export function useProjectEstimateData(projectId: MaybeRefOrGetter<string>) {
  const auth = useAuthStore(), client = useQueryClient()
  const queryKey = computed(() => ['account', auth.user?.id, 'project-estimate', toValue(projectId)])
  const query = useQuery({ queryKey, queryFn: ({ signal }) => sharedRequest<ProjectEstimate>(`/api/projects/${toValue(projectId)}/estimate`, { signal }), retry: false, refetchInterval: 30000 })
  async function save(revision: number, patch: Partial<EstimateContent>) {
    const userId = auth.user?.id, key = queryKey.value
    try {
      const result = await sharedRequest<ProjectEstimate>(`/api/projects/${toValue(projectId)}/estimate`, { method: 'PUT', body: { revision, ...patch } })
      if (auth.user?.id !== userId) throw Error('Аккаунт изменился. Откройте проект заново.')
      client.setQueryData(key, result)
      return result
    } catch (failure: any) {
      if (failure?.statusCode === 409) { await query.refetch(); throw Error('Данные проекта изменены другим участником. Откройте форму заново, чтобы увидеть актуальную версию.') }
      throw failure
    }
  }
  return { query, save }
}
