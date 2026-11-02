import { z } from 'zod'

export const projectStages = [
  { key: 'input-documents', number: '01', label: 'Входные данные', icon: 'i-lucide-file-input' },
  { key: 'estimate', number: '02', label: 'Смета', icon: 'i-lucide-calculator' },
  { key: 'contracts', number: '03', label: 'Договора', icon: 'i-lucide-file-signature' },
  { key: 'execution', number: '04', label: 'Исполнение', icon: 'i-lucide-files' },
  { key: 'closing', number: '05', label: 'Подтверждение и закрывающие акты', icon: 'i-lucide-clipboard-check' }
] as const

export const dashboardBlocks = [
  { key: 'info', label: 'Информация о проекте', description: 'Ваши права, участники и даты.', icon: 'i-lucide-info' },
  { key: 'metrics', label: 'Показатели проекта', description: 'Затраты, выручка, прибыль, компании и документы.', icon: 'i-lucide-chart-no-axes-combined' },
  { key: 'stages', label: 'Этапы проекта', description: 'Быстрый переход к этапам и их статусам.', icon: 'i-lucide-list-checks' },
  { key: 'relationships', label: 'Взаимосвязь', description: 'Переход к карте участников и документов.', icon: 'i-lucide-workflow' },
  { key: 'timeline', label: 'Сроки и подтверждения', description: 'Ближайшие сроки и статусы договоров.', icon: 'i-lucide-calendar-days' },
  { key: 'counterparties', label: 'Контрагенты', description: 'Компании, участвующие в проекте.', icon: 'i-lucide-building-2' },
  { key: 'legal-entities', label: 'Наши юр. лица', description: 'Юридические лица вашей стороны.', icon: 'i-lucide-landmark' },
  { key: 'members', label: 'Участники проекта', description: 'Команда проекта и права доступа.', icon: 'i-lucide-users-round' }
] as const

const blockKey = z.enum(['info', 'metrics', 'stages', 'relationships', 'timeline', 'counterparties', 'legal-entities', 'members'])
export type DashboardBlockKey = z.infer<typeof blockKey>
export const dashboardLayoutSchema = z.object({
  blocks: z.array(z.object({ key: blockKey, visible: z.boolean() }).strict())
    .length(dashboardBlocks.length)
    .refine(blocks => new Set(blocks.map(block => block.key)).size === dashboardBlocks.length, 'Каждый блок должен встречаться один раз')
}).strict()
export const dashboardWriteSchema = dashboardLayoutSchema.extend({ revision: z.number().int().min(0) })
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>
export type ProjectDashboard = DashboardLayout & { revision: number }
export const defaultDashboard = (): DashboardLayout => ({ blocks: dashboardBlocks.map(({ key }) => ({ key, visible: true })) })
