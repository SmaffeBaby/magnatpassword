import type { H3Event } from 'h3'
import type { VaultData, Credential } from '../../shared/types/vault'
import type { SharedCard, SharedVault } from '../../shared/types/sharing'
import type { ProjectInputs } from '../../shared/types/project-inputs'
import type { Project } from '../../shared/types/projects'
import type { ProjectEstimate } from '../../shared/types/estimate'
import type { AssistantEditTarget } from '../../shared/types/assistant-edit'
import { assistantFetch } from './assistant-context'
export async function assistantEditRecords(event: H3Event) {
  const [personal, workspace] = await Promise.all([
    assistantFetch<{ data: VaultData; revision: number }>(event, '/api/personal-vault'),
    assistantFetch<{ groups: SharedVault[]; cards: SharedCard[] }>(event, '/api/workspace')
  ])
  const records: { id: string; label: string; entry: Credential; writable: boolean; revision: number; save: (entry: Credential) => Promise<unknown> }[] = []
  for (const source of [{ id: 'personal', name: personal.data?.name || 'Личное', data: personal.data, revision: personal.revision, canEdit: true }, ...workspace.groups]) {
    if (!source.data) continue
    for (const entry of source.data.entries.filter(entry => !entry.sharedCardId)) records.push({ id: `${source.id}/${entry.id}`, label: `${entry.title} · ${source.name}`, entry, writable: source.canEdit !== false, revision: source.revision, save: next => assistantFetch(event, source.id === 'personal' ? '/api/personal-vault' : `/api/shared-vaults/${source.id}`, { method: 'PUT', body: { revision: source.revision, data: { ...source.data, entries: source.data.entries.map(e => e.id === entry.id ? next : e) } } }) })
  }
  for (const card of workspace.cards.filter(card => !card.archived)) records.push({ id: `card/${card.id}`, label: card.entry.title, entry: card.entry, writable: card.canEdit !== false, revision: card.revision, save: entry => assistantFetch(event, `/api/shared-cards/${card.id}`, { method: 'PUT', body: { entry, revision: card.revision } }) })
  return records
}
export async function assistantProjectTargets(event: H3Event, projectId?: string) {
  const projects = await assistantFetch<Project[]>(event, '/api/projects')
  const targets: AssistantEditTarget[] = projects.filter(p => p.permission !== 'viewer').map(p => ({ id: p.id, label: p.name, revision: p.revision, fields: [{ id: 'name', label: 'Название проекта', value: p.name }] }))
  if (projectId && targets.some(t => t.id === projectId)) {
    const estimate = await assistantFetch<ProjectEstimate>(event, `/api/projects/${projectId}/estimate`)
    targets.push({ id: `${projectId}/details`, label: 'Смета · реквизиты', revision: estimate.revision, fields: ['title', 'code', 'description', 'finishDate', 'batchQuantity', 'clientUnitPrice', 'revenueAmount', 'markupPercent', 'revenueVatRate'].map(id => ({ id, label: ({ title: 'Название', code: 'Код', description: 'Описание', finishDate: 'Дата завершения', batchQuantity: 'Тираж', clientUnitPrice: 'Цена клиенту', revenueAmount: 'Выручка', markupPercent: 'Наценка, %', revenueVatRate: 'НДС, %' } as Record<string, string>)[id]!, value: String(estimate.details[id as keyof typeof estimate.details]) })) })
    const inputs = await assistantFetch<ProjectInputs>(event, `/api/projects/${projectId}/input-data`)
    for (const card of inputs.cards) targets.push({ id: `${projectId}/input/${card.id}`, label: `Входные данные · ${card.title}`, revision: inputs.revision, fields: [{ id: 'title', label: 'Название', value: card.title }, { id: 'description', label: 'Описание', value: card.description }, ...card.fields.map(f => ({ id: `custom/${f.id}`, label: f.label, value: f.value }))] })
    for (const item of estimate.items) targets.push({ id: `${projectId}/item/${item.id}`, label: `Смета · ${item.name}`, revision: estimate.revision, fields: ['name', 'quantity', 'price', 'deadline', 'link', 'unit', 'vatRate'].map(id => ({ id, label: ({ name: 'Название', quantity: 'Количество', price: 'Цена', deadline: 'Срок', link: 'Ссылка', unit: 'Единица', vatRate: 'НДС, %' } as Record<string, string>)[id]!, value: String(item[id as keyof typeof item]) })) })
  }
  return targets
}
export function credentialEditTargets(records: Awaited<ReturnType<typeof assistantEditRecords>>): AssistantEditTarget[] {
  return records.map(record => ({ id: record.id, label: record.label, revision: record.revision, fields: [
    ...(!record.entry.kind ? ['title', 'url', 'username', 'password', 'notes'].map(id => ({ id, label: ({ title: 'Название', url: 'Сайт', username: 'Логин', password: 'Пароль', notes: 'Заметки' } as Record<string, string>)[id]!, value: id === 'password' ? '' : String(record.entry[id as keyof Credential] || ''), secret: id === 'password' })) : []),
    ...(record.entry.customFields || []).filter(f => f.type !== 'subscription').map(f => ({ id: `custom/${f.id}`, label: f.label, value: f.type === 'secret' ? '' : f.value, secret: f.type === 'secret' }))
  ] })).filter(t => t.fields.length)
}
