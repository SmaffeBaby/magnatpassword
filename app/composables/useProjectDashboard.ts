import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { defaultDashboard, type DashboardLayout, type ProjectDashboard } from '~~/shared/utils/project-dashboard'

export function useProjectDashboard(projectId: MaybeRefOrGetter<string>) {
  const auth = useAuthStore(), client = useQueryClient()
  const queryKey = computed(() => ['account', auth.user?.id, 'project-dashboard', toValue(projectId)])
  const query = useQuery({ queryKey, queryFn: ({ signal }) => sharedRequest<ProjectDashboard>(`/api/projects/${toValue(projectId)}/dashboard`, { signal }), retry: false })
  const blocks = computed(() => query.data.value?.blocks ?? defaultDashboard().blocks)
  async function save(revision: number, layout: DashboardLayout) {
    const userId = auth.user?.id, key = queryKey.value
    try {
      const result = await sharedRequest<ProjectDashboard>(`/api/projects/${toValue(projectId)}/dashboard`, { method: 'PUT', body: { revision, ...layout } })
      if (auth.user?.id !== userId) throw Error('Аккаунт изменился. Откройте проект заново.')
      client.setQueryData(key, result)
    } catch (failure: any) {
      if (failure?.statusCode === 409) {
        await query.refetch()
        throw Error('Вид страницы изменён на другом устройстве. Закройте настройки и откройте их заново.')
      }
      throw failure
    }
  }
  return { query, blocks, save }
}
