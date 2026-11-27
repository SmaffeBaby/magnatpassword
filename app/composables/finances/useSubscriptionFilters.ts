import { subscriptionEnded } from '~~/shared/utils/subscriptions'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
export function useSubscriptionFilters(props:{entries:ScopedCredential[];groups?:{id:string;name:string}[]}, scope: 'upcoming' | 'calendar' | 'finances' | 'history' = 'upcoming') {
 const common=useSubscriptions(props)
 const {group,currency,search,statusFilter}=toRefs(useFiltersStore().subscriptions[scope])
 const groups=computed(()=>[{label:'Все хранилища',value:'all'},...(props.groups??[...new Map(props.entries.map(entry=>[entry.vaultId,{id:entry.vaultId,name:entry.vaultName}])).values()]).map(item=>({label:item.name,value:item.id}))])
 const currencyOptions=[{label:'Все валюты',value:'all'},...['RUB','USD','EUR','CNY'].map(value=>({label:value,value}))]
 const statusOptions=[{label:scope==='upcoming'?'Все текущие':'Все сроки',value:'all'},{label:'Просроченные',value:'overdue'},{label:'В ближайшие 7 дней',value:'week'},{label:'В ближайшие 30 дней',value:'month'},{label:'Будущие',value:'future'}]
 if (scope==='upcoming') statusOptions.push({label:'Запланировано завершение',value:'scheduled'},{label:'Завершённые',value:'ended'})
 const matchingRows=computed(()=>common.rows.value.filter(row=>{
  if (group.value!=='all' && !(row.entry.vaultIds??[row.entry.vaultId]).includes(group.value)) return false
  if (currency.value!=='all' && row.subscription.currency!==currency.value) return false
  if (!`${row.entry.title} ${row.field.label} ${row.entry.vaultName}`.toLowerCase().includes(search.value.trim().toLowerCase())) return false

  const ended=subscriptionEnded(row.subscription,common.today.value)
  switch (statusFilter.value) {
   case 'all': return scope!=='upcoming' || !ended
   case 'ended': return ended
   case 'scheduled': return !!row.subscription.endsOn && !ended
   case 'overdue': return !ended && row.daysLeft<0
   case 'week': return !ended && row.daysLeft>=0 && row.daysLeft<=7
   case 'month': return !ended && row.daysLeft>=0 && row.daysLeft<=30
   case 'future': return !ended && row.daysLeft>=0
   default: return false
  }
 }))

 return {...common,group,currency,search,statusFilter,groups,currencyOptions,statusOptions,matchingRows}
}
