import type { Credential, CredentialAccount } from '../types/vault'
export const entryCategoryIds=(entry:Credential)=>[...new Set([...(entry.categoryIds??[]),entry.categoryId].filter(Boolean))]
export function credentialAccounts(entry:Credential):CredentialAccount[] {
 if(entry.accounts)return entry.accounts
 return entry.username||entry.password?[{id:entry.id,label:'Основной доступ',username:entry.username,password:entry.password}]:[]
}
