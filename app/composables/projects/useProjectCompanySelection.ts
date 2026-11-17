import { useQueryClient } from '@tanstack/vue-query'
import type { ProjectEstimate } from '~~/shared/types/estimate'

export function useProjectCompanySelection(projectId: MaybeRefOrGetter<string>) {
  const auth = useAuthStore(), client = useQueryClient()
  const { query: estimate } = useProjectEstimateData(projectId)
  const { query: catalog } = useProjectCompanies(projectId)
  const linking = ref(false)
  const options = computed(() => {
    const linked = estimate.data.value?.counterparties ?? []
    const rows = linked.map(party => ({ value: party.id, label: party.company + (party.isOwnLegalEntity ? ' · Наше юр. лицо' : ''), inn: party.inn, description: party.inn ? 'ИНН ' + party.inn : '', own: !!party.isOwnLegalEntity }))
    for (const party of catalog.data.value ?? []) {
      if (linked.some(item => item.catalogId === party.id)) continue
      rows.push({ value: `catalog:${party.id}`, label: party.company + (party.isOwnLegalEntity ? ' · Наше юр. лицо' : ''), inn: party.inn, description: `${party.inn ? 'ИНН ' + party.inn + ' · ' : ''}Будет добавлена в проект`, own: !!party.isOwnLegalEntity })
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  })
  async function select(value: string, revision: number): Promise<{ id: string; estimate?: ProjectEstimate }> {
    if (!value.startsWith('catalog:')) return { id: value }
    if (linking.value) throw Error('Дождитесь добавления компании')
    const userId = auth.user?.id, id = toValue(projectId), catalogId = value.slice(8)
    linking.value = true
    try {
      const result = await sharedRequest<ProjectEstimate>(`/api/projects/${id}/companies`, { method: 'PUT', body: { catalogId, revision } })
      if (auth.user?.id !== userId) throw Error('Аккаунт изменился. Откройте проект заново.')
      client.setQueryData(['account', userId, 'project-estimate', id], result)
      const party = result.counterparties.find(item => item.catalogId === catalogId)
      if (!party) throw Error('Компания недоступна. Обновите список компаний.')
      return { id: party.id, estimate: result }
    } finally { linking.value = false }
  }
  return { catalog, options, linking, select }
}
