import { defineStore } from 'pinia'
import type { Currency } from '~~/shared/types/subscriptions'
import type { RelationshipMode } from '~~/shared/utils/relationships'
import { todayDate } from '~~/shared/utils/subscriptions'

const structureFilters = () => ({ categories: { query: '', linkedOnly: false, selectedId: '' }, vaults: { query: '', linkedOnly: false, selectedId: '' } })
const subscriptionFilters = () => ({ group: 'all', currency: 'all', search: '', statusFilter: 'all' })
export const useFiltersStore = defineStore('filters', () => {
  const collapsedFolders=ref<string[]>([])
  const workspaceId = ref('all')
  const workspace = reactive({ active: 'all', query: '', sort: 'updated' })
  const subscriptions = reactive({ upcoming: subscriptionFilters(), calendar: subscriptionFilters(), finances: subscriptionFilters(), history: subscriptionFilters() })
  const calendar = reactive({ month: todayDate().slice(0, 7) + '-01', selected: todayDate() })
  const finances = reactive({ from: todayDate().slice(0, 4) + '-01-01', to: todayDate().slice(0, 4) + '-12-31', chartCurrency: 'RUB' as Currency, tab: 'plan' })
  const history = reactive({ subscription: 'all', from: '', to: '' })
  const relationships = reactive({ view: 'cards' as 'cards' | 'categories' | 'vaults', structure: structureFilters(), mode: 'all' as RelationshipMode, query: '', linkedOnly: true })
  const vault = useVaultStore()
  bindSavedFilters('workspace', reactive({ collapsedFolders, workspaceId, workspace, subscriptions, calendar, finances, history, relationships }), () => vault.unlocked)
  return { collapsedFolders, history, workspaceId, workspace, subscriptions, calendar, finances, relationships }
})
