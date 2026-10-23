import type {VaultSource,SharedCard} from '../types/sharing'
import type {VaultData} from '../types/vault'
export function projectSharedCards(sources:VaultSource[],cards:SharedCard[]):VaultSource[]{
 return sources.map(source=>{
  const linked=cards.filter(card=>card.vaultIds.length?card.vaultIds.includes(source.id):source.id==='personal')
  return {...source,data:{...source.data,entries:[...source.data.entries,...linked.filter(card=>!card.archived).map(card=>({...card.entry,sharedCardId:card.id}))],subscriptionPayments:[...(source.data.subscriptionPayments??[]),...linked.flatMap(card=>card.payments.map(payment=>({...payment,sharedCardId:card.id})))]}}
 })
}
export function storedVaultData(data:VaultData):VaultData {
 return {...data,entries:data.entries.filter(entry=>!entry.sharedCardId),subscriptionPayments:data.subscriptionPayments?.filter(payment=>!payment.sharedCardId)}
}
