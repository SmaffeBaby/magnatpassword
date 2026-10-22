import type { VaultData } from '../types/vault'
const defaults: Record<string, string> = { work: 'работа', personal: 'личное', finance: 'финансы', apps: 'приложения' }
export function withoutDefaultCategories(data: VaultData): VaultData {
  const removed = new Set(data.categories.filter(c => defaults[c.id] === c.name.trim().toLowerCase()).map(c => c.id))
  if (!removed.size) return data
  return { ...data, categories: data.categories.filter(c => !removed.has(c.id)), entries: data.entries.map(e => removed.has(e.categoryId) ? { ...e, categoryId: '' } : e) }
}
