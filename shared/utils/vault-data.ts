import {entryCategoryIds} from './credentials'
import type { VaultData } from '../types/vault'
const defaults: Record<string, string> = { work: 'работа', personal: 'личное', finance: 'финансы', apps: 'приложения' }
export function withoutDefaultCategories(data: VaultData): VaultData {
  const removed = new Set(data.categories.filter(c => defaults[c.id] === c.name.trim().toLowerCase()).map(c => c.id))
  if (!removed.size) return data
  return { ...data, categories: data.categories.filter(c => !removed.has(c.id)), entries: data.entries.map(e => {const ids=entryCategoryIds(e).filter(id=>!removed.has(id));return removed.has(e.categoryId)||e.categoryIds?.some(id=>removed.has(id))?{...e,categoryId:ids[0]??'',...(e.categoryIds?{categoryIds:ids}:{})}:e}) }
}
