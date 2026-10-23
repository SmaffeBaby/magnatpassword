import type { ScopedCredential } from '~~/shared/utils/vault-sources'
export function useSubscriptionFilters(props:{entries:ScopedCredential[];groups?:{id:string;name:string}[]}, scope: 'upcoming' | 'calendar' | 'finances' | 'history' = 'upcoming') {
 const common=useSubscriptions(props)
 const {group,currency,search,statusFilter}=toRefs(useFiltersStore().subscriptions[scope])
 const groups=computed(()=>[{label:'Все хранилища',value:'all'},...(props.groups??[...new Map(props.entries.map(entry=>[entry.vaultId,{id:entry.vaultId,name:entry.vaultName}])).values()]).map(item=>({label:item.name,value:item.id}))])
 const currencyOptions=[{label:'Все валюты',value:'all'},...['RUB','USD','EUR','CNY'].map(value=>({label:value,value}))]
 const statusOptions=[{label:'Все сроки',value:'all'},{label:'Просроченные',value:'overdue'},{label:'В ближайшие 7 дней',value:'week'},{label:'В ближайшие 30 дней',value:'month'},{label:'Будущие',value:'future'}]
 const matchingRows=computed(()=>common.rows.value.filter(row=>(group.value==='all'||(row.entry.vaultIds??[row.entry.vaultId]).includes(group.value))&&(currency.value==='all'||row.subscription.currency===currency.value)&&`${row.entry.title} ${row.field.label} ${row.entry.vaultName}`.toLowerCase().includes(search.value.trim().toLowerCase())&&(statusFilter.value==='all'||statusFilter.value==='overdue'&&row.daysLeft<0||statusFilter.value==='week'&&row.daysLeft>=0&&row.daysLeft<=7||statusFilter.value==='month'&&row.daysLeft>=0&&row.daysLeft<=30||statusFilter.value==='future'&&row.daysLeft>=0)))
 watch(groups,options=>{if(!options.some(option=>option.value===group.value))group.value='all'})
 return {...common,group,currency,search,statusFilter,groups,currencyOptions,statusOptions,matchingRows}
}
