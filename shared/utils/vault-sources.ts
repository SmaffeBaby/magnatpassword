import type { Category, CategoryFolder, Credential } from '../types/vault'
import type { VaultSource } from '../types/sharing'
export interface ScopedCredential extends Credential { vaultId: string; vaultName: string; vaultIds?:string[];vaultNames?:string[] }
export interface ScopedCategory extends Category { vaultId: string; vaultName: string; filterId: string }
export const categoryFilterId = (vaultId: string, categoryId: string) => `${vaultId}/${categoryId}`
export function sourceEntries(sources: VaultSource[], includeFinance = false): ScopedCredential[] {
  const result:ScopedCredential[]=[],linked=new Map<string,ScopedCredential>()
  for(const source of sources)for(const entry of source.data.entries){
    if(entry.kind&&!includeFinance)continue
    if(entry.sharedCardId&&linked.has(entry.sharedCardId)){const existing=linked.get(entry.sharedCardId)!;existing.vaultIds!.push(source.id);existing.vaultNames!.push(source.name);continue}
    const value={...entry,vaultId:source.id,vaultName:source.name,vaultIds:[source.id],vaultNames:[source.name]};result.push(value);if(entry.sharedCardId)linked.set(entry.sharedCardId,value)
  }
  return result
}
export function sourceCategories(sources: VaultSource[]): ScopedCategory[] {
  return sources.flatMap(source => source.data.categories.map(category => ({ ...category, vaultId: source.id, vaultName: source.name, filterId: categoryFilterId(source.id, category.id) })))
}

export interface ScopedCategoryFolder extends CategoryFolder {vaultId:string;vaultName:string;filterId:string}
export function sourceCategoryFolders(sources:VaultSource[]):ScopedCategoryFolder[]{
 return sources.flatMap(source=>(source.data.categoryFolders??[]).map(folder=>({...folder,vaultId:source.id,vaultName:source.name,filterId:categoryFilterId(source.id,folder.id)})))
}

export function categoryInFolder(category:ScopedCategory,folder:ScopedCategoryFolder):boolean {
 return (category.vaultId===folder.vaultId&&category.folderId===folder.id)||!!folder.categoryLinks?.some(link=>link.vaultId===category.vaultId&&link.categoryId===category.id)
}
