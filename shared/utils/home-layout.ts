import { HOME_APP_IDS, type HomeAppId, type HomeLayout } from '../types/home-layout'

export const homeApps = {
  passwords: { label: 'Пароли', actionLabel: 'Пароли', icon: 'i-lucide-key-round' },
  finances: { label: 'Финансы', actionLabel: 'Финансы', icon: 'i-lucide-chart-no-axes-combined' },
  relationships: { label: 'Взаимосвязи', actionLabel: 'Взаимосвязи', icon: 'i-lucide-network' },
  contracts: { label: 'Реестр договоров', actionLabel: 'Реестр договоров', icon: 'i-lucide-notebook-tabs' },
  projects: { label: 'Проекты', actionLabel: 'Проекты', icon: 'i-lucide-folder-kanban' },
  team: { label: 'Команда', actionLabel: 'Команду', icon: 'i-lucide-users-round' },
  kaban: { label: 'Кабан', actionLabel: 'Кабан', icon: 'i-lucide-columns-3' }
} satisfies Record<HomeAppId, { label: string; actionLabel: string; icon: string }>

export const defaultHomeLayout = (): HomeLayout => ({ version: 1, rows: [{ align: 'center', cards: [...HOME_APP_IDS] }], hidden: [] })
export const copyHomeLayout = (layout: HomeLayout): HomeLayout => ({ version: 1, rows: layout.rows.map(row => ({ align: row.align, cards: [...row.cards] })), hidden: [...layout.hidden] })

export function moveHomeCard(layout: HomeLayout, id: HomeAppId, target: number | 'new', position?: number): HomeLayout {
  const next = copyHomeLayout(layout)
  if (!HOME_APP_IDS.includes(id)) return next
  const source = next.rows.find(row => row.cards.includes(id)), sourcePosition = source?.cards.indexOf(id) ?? -1
  const destination = target === 'new' ? { align: 'center' as const, cards: [] as HomeAppId[] } : next.rows[target]
  if (!destination) return next
  let index = position ?? destination.cards.length
  if (source === destination && sourcePosition >= 0 && sourcePosition < index) index--
  if (source) source.cards.splice(sourcePosition, 1)
  next.hidden = next.hidden.filter(card => card !== id)
  destination.cards.splice(Math.max(0, Math.min(index, destination.cards.length)), 0, id)
  if (target === 'new') next.rows.push(destination)
  next.rows = next.rows.filter(row => row.cards.length)
  return next
}

export function hideHomeCard(layout: HomeLayout, id: HomeAppId): HomeLayout {
  const next = copyHomeLayout(layout)
  if (!HOME_APP_IDS.includes(id)) return next
  next.rows = next.rows.map(row => ({ ...row, cards: row.cards.filter(card => card !== id) })).filter(row => row.cards.length)
  if (!next.hidden.includes(id)) next.hidden.push(id)
  return next
}
