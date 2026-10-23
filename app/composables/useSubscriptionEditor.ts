import type { SubscriptionCard } from '~~/shared/types/subscriptions'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import { subscriptionCardKey } from '~~/shared/utils/subscriptions'
import type { CustomField } from '~~/shared/types/vault'
import {addPeriod,todayDate} from '~~/shared/utils/subscriptions'
export function useSubscriptionEditor(props:{field:CustomField;cards?:ScopedCredential[];ownerTitle?:string}){
 const sub=computed(()=>props.field.subscription!)
 const cardReferences=computed(()=>{
  const refs=new Map<string,SubscriptionCard>()
  for(const card of props.cards??[]){const ref={vaultId:card.vaultId,entryId:card.id,...(card.sharedCardId?{sharedCardId:card.sharedCardId}:{})};refs.set(subscriptionCardKey(ref),ref)}
  for(const ref of [sub.value.primaryCard,...(sub.value.linkedCards??[])])if(ref&&!refs.has(subscriptionCardKey(ref)))refs.set(subscriptionCardKey(ref),ref)
  return refs
 })
 const cardOptions=computed(()=>[...cardReferences.value].map(([value,ref])=>{const card=props.cards?.find(card=>subscriptionCardKey({vaultId:card.vaultId,entryId:card.id,sharedCardId:card.sharedCardId})===value);return {value,label:card?`${card.title} · ${card.vaultName}`:'Недоступная карточка'}}))
 const primaryOptions=computed(()=>[{label:props.ownerTitle||'Текущая карточка',value:'__current'},...cardOptions.value])
 const primaryCard=computed({get:()=>sub.value.primaryCard?subscriptionCardKey(sub.value.primaryCard):'__current',set:(value:string)=>{
  sub.value.primaryCard=value==='__current'?undefined:cardReferences.value.get(value)
  sub.value.linkedCards=sub.value.linkedCards?.filter(card=>subscriptionCardKey(card)!==value)
 }})
 const linkedCardOptions=computed(()=>cardOptions.value.filter(option=>option.value!==primaryCard.value))
 const linkedCards=computed({get:()=>(sub.value.linkedCards??[]).map(subscriptionCardKey),set:(values:string[])=>{sub.value.linkedCards=[...new Set(values)].slice(0,50).flatMap(value=>{const card=cardReferences.value.get(value);return card?[card]:[]})}})
 const currencies=[{label:'Рубли · RUB',value:'RUB'},{label:'Доллары · USD',value:'USD'},{label:'Евро · EUR',value:'EUR'},{label:'Юани · CNY',value:'CNY'}]
 const units=[{label:'Дней',value:'day'},{label:'Месяцев',value:'month'},{label:'Лет',value:'year'}]
 function updatePeriod(){if(!sub.value)return;const next=addPeriod(sub.value.startsOn,sub.value.periodCount,sub.value.periodUnit);if(next){sub.value.paidUntil=next;sub.value.paidFrom=sub.value.startsOn}}
 function toggleReminders(enabled:boolean){sub.value.reminders=enabled?{leadDays:[7,1,0],repeatEveryDays:0,customDates:[]}:undefined}
 function addLead(){if(sub.value.reminders&&sub.value.reminders.leadDays.length<12)sub.value.reminders.leadDays.push(1)}
 function addDate(){if(sub.value.reminders&&sub.value.reminders.customDates.length<12)sub.value.reminders.customDates.push(todayDate())}
 watch(()=>[sub.value?.startsOn,sub.value?.periodCount,sub.value?.periodUnit],updatePeriod)
 return {sub,primaryCard,primaryOptions,linkedCards,linkedCardOptions,currencies,units,toggleReminders,addLead,addDate}
}
