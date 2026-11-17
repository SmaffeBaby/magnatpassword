import type { FinanceMonth, FinanceSegment } from '~~/shared/types/finances'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import type {VaultSource} from '~~/shared/types/sharing'
import type {Currency} from '~~/shared/types/subscriptions'
import {sourceEntries} from '~~/shared/utils/vault-sources'
import {sourcePayments,unpaidProjectedCharges,currencyTotals,amountLabel,currencies} from '~~/shared/utils/subscription-finances'
import {validDate,dayDifference,addPeriod,todayDate,dateLabel} from '~~/shared/utils/subscriptions'
export function useSubscriptionFinances(props:{sources:VaultSource[]}) {
 const filters=useSubscriptionFilters({get entries(){return sourceEntries(props.sources,true)},get groups(){return props.sources.map(source=>({id:source.id,name:source.name}))}},'finances')
 const {from,to,chartCurrency,tab}=toRefs(useFiltersStore().finances)
 const validRange=computed(()=>validDate(from.value)&&validDate(to.value)&&from.value<=to.value&&dayDifference(from.value,to.value)<=3660)
 const planned=computed(()=>validRange.value?unpaidProjectedCharges(filters.matchingRows.value,sourcePayments(props.sources),from.value,to.value,filters.today.value).filter(event=>event.charge):[])
 const payments=computed(()=>sourcePayments(props.sources).filter(payment=>(filters.group.value==='all'||payment.vaultIds.includes(filters.group.value))&&(filters.currency.value==='all'||payment.currency===filters.currency.value)&&`${payment.service} ${payment.label} ${payment.vaultName}`.toLowerCase().includes(filters.search.value.trim().toLowerCase())&&validRange.value&&todayDate(new Date(payment.paidAt))>=from.value&&todayDate(new Date(payment.paidAt))<=to.value).sort((a,b)=>b.paidAt.localeCompare(a.paidAt)))
 const planTotals=computed(()=>currencyTotals(planned.value)),paidTotals=computed(()=>currencyTotals(payments.value))
 const chartOptions=currencies.map(value=>({label:value,value}))
 const entries=computed(()=>sourceEntries(props.sources,true))
 const paymentEntry=(payment:ReturnType<typeof sourcePayments>[number])=>entries.value.find(entry=>entry.id===payment.entryId&&(payment.sharedCardId?entry.sharedCardId===payment.sharedCardId:!entry.sharedCardId&&(entry.vaultIds??[entry.vaultId]).some(id=>payment.vaultIds.includes(id))))
 const serviceKey=(entry:{sharedCardId?:string;vaultId:string;id:string},fieldId:string)=>`${entry.sharedCardId?'shared:'+entry.sharedCardId:entry.vaultId+'/'+entry.id}/${fieldId}`
 function segments(items:{key:string;label:string;amount:number;entry?:ScopedCredential}[]):FinanceSegment[]{
  const grouped=new Map<string,{key:string;label:string;cents:number;entry?:ScopedCredential}>()
  for(const item of items){const existing=grouped.get(item.key);if(existing)existing.cents+=Math.round(item.amount*100);else grouped.set(item.key,{key:item.key,label:item.label,cents:Math.round(item.amount*100),entry:item.entry})}
  return [...grouped.values()].map(({cents,...item})=>({...item,amount:cents/100})).sort((a,b)=>a.key.localeCompare(b.key))
 }
 const monthly=computed<FinanceMonth[]>(()=>{
  if(!validRange.value)return []
  const months:FinanceMonth[]=[]
  let date=from.value.slice(0,7)+'-01'
  while(date&&date<=to.value){
   const key=date.slice(0,7)
   const plannedSegments=segments(planned.value.filter(event=>event.currency===chartCurrency.value&&event.date.startsWith(key)).map(event=>({key:serviceKey(event.row.entry,event.row.field.id),label:`${event.row.entry.title} · ${event.row.field.label}`,amount:event.amount,entry:event.row.entry})))
   const paidSegments=segments(payments.value.filter(payment=>payment.currency===chartCurrency.value&&todayDate(new Date(payment.paidAt)).startsWith(key)).map(payment=>({key:serviceKey({sharedCardId:payment.sharedCardId,vaultId:payment.vaultId,id:payment.entryId},payment.fieldId),label:`${payment.service} · ${payment.label}`,amount:payment.amount,entry:paymentEntry(payment)})))
   const total=(items:FinanceSegment[])=>items.reduce((sum,item)=>sum+Math.round(item.amount*100),0)/100
   months.push({key,label:new Intl.DateTimeFormat('ru-RU',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),planned:total(plannedSegments),paid:total(paidSegments),plannedSegments,paidSegments})
   date=addPeriod(date,1,'month')
  }
  return months
 })
 const distribution=computed(()=>props.sources.map(source=>({key:source.id,label:source.name,value:planned.value.filter(event=>event.currency===chartCurrency.value&&(filters.group.value==='all'?event.row.entry.vaultId===source.id:filters.group.value===source.id)).reduce((sum,event)=>sum+Math.round(event.amount*100),0)/100})).filter(item=>item.value>0))
 watch(()=>filters.currency.value,value=>{if(currencies.includes(value as Currency))chartCurrency.value=value as Currency})
 const stamp=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
 return {paymentEntry,...filters,from,to,chartCurrency,chartOptions,tab,validRange,planned,payments,planTotals,paidTotals,monthly,distribution,amountLabel,dateLabel,stamp}
}
