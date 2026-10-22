import type { Category, Credential } from '../types/vault'
import type { VaultSource } from '../types/sharing'
export interface ScopedCredential extends Credential { vaultId: string; vaultName: string }
export interface ScopedCategory extends Category { vaultId: string; vaultName: string; filterId: string }
export const categoryFilterId = (vaultId: string, categoryId: string) => `${vaultId}/${categoryId}`
export function sourceEntries(sources: VaultSource[]): ScopedCredential[] {
  return sources.flatMap(source => source.data.entries.map(entry => ({ ...entry, vaultId: source.id, vaultName: source.name })))
}
export function sourceCategories(sources: VaultSource[]): ScopedCategory[] {
  return sources.flatMap(source => source.data.categories.map(category => ({ ...category, vaultId: source.id, vaultName: source.name, filterId: categoryFilterId(source.id, category.id) })))
}
