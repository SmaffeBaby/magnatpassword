import type { HomeAppId } from '~~/shared/types/home-layout'
import { projectTaskViews } from '~~/shared/utils/project-task-planning'

export interface HomeServiceLink {
  to: string
  label: string
  icon: string
  description?: string
}

export const homeServiceLinks: Record<Exclude<HomeAppId, 'applications'>, HomeServiceLink[]> = {
  kaban: [
    { to: '/kaban?view=mine', label: 'Мои задачи', icon: 'i-lucide-user-round-check' },
    { to: '/kaban?view=all', label: 'Все задачи', icon: 'i-lucide-list-checks' },
    ...projectTaskViews.map(view => ({
      to: view.value === 'board' ? '/kaban' : `/kaban?view=${view.value}`,
      label: view.label,
      icon: view.icon
    }))
  ],
  spaces: [
    { to: '/spaces', label: 'Все пространства', icon: 'i-lucide-orbit' }
  ],
  passwords: [
    { to: '/password', label: 'Все пароли', icon: 'i-lucide-key-round' },
    { to: '/password?view=favorites', label: 'Избранное', icon: 'i-lucide-star' },
    { to: '/password/categories', label: 'Категории', icon: 'i-lucide-folder' }
  ],
  relationships: [
    { to: '/relationships', label: 'Все взаимосвязи', icon: 'i-lucide-network' },
    { to: '/relationships/map', label: 'Карта взаимосвязей', icon: 'i-lucide-map' }
  ],
  finances: [
    { to: '/finances', label: 'Финансы', icon: 'i-lucide-chart-no-axes-combined' },
    { to: '/finances/subscriptions', label: 'Ближайшие подписки', icon: 'i-lucide-clock-3' },
    { to: '/finances/calendar', label: 'Календарь подписок', icon: 'i-lucide-calendar-days' },
    { to: '/finances/history', label: 'История списаний', icon: 'i-lucide-history' }
  ],
  team: [
    { to: '/team', label: 'Команда', icon: 'i-lucide-users-round' },
    { to: '/profile', label: 'Мой профиль', icon: 'i-lucide-user-round' }
  ],
  projects: [
    { to: '/projects', label: 'Все проекты', icon: 'i-lucide-folder-kanban' },
    { to: '/projects?tab=counterparties', label: 'Контрагенты', icon: 'i-lucide-building-2' },
    { to: '/projects?tab=legal-entities', label: 'Наши юр. лица', icon: 'i-lucide-landmark' },
    { to: '/projects?tab=document-templates', label: 'Шаблоны документов', icon: 'i-lucide-files' }
  ],
  contracts: [
    { to: '/contract-register', label: 'Все договоры', icon: 'i-lucide-notebook-tabs' },
    { to: '/contract-register?tab=calendar', label: 'Календарь договоров', icon: 'i-lucide-calendar-days' },
    { to: '/contract-register?tab=counterparties', label: 'Контрагенты', icon: 'i-lucide-building-2' },
    { to: '/contract-register?tab=legal-entities', label: 'Наши юр. лица', icon: 'i-lucide-landmark' }
  ]
}
