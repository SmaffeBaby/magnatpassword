import type {VaultSource} from '~~/shared/types/sharing'
import type {Currency} from '~~/shared/types/subscriptions'
import {sourceEntries} from '~~/shared/utils/vault-sources'
import {sourcePayments,projectedCharges,currencyTotals,amountLabel,currencies} from '~~/shared/utils/subscription-finances'
import {validDate,dayDifference,addPeriod,todayDate,dateLabel} from '~~/shared/utils/subscriptions'
export function useSubscriptionFinances(props:{sources:VaultSource[]}) {
 const filters=useSubscriptionFilters({get entries(){return sourceEntries(props.sources)},get groups(){return props.sources.map(source=>({id:source.id,name:source.name}))}})
 const year=todayDate().slice(0,4),from=ref(year+'-01-01'),to=ref(year+'-12-31'),chartCurrency=ref<Currency>('RUB'),tab=ref('plan')
 const validRange=computed(()=>validDate(from.value)&&validDate(to.value)&&from.value<=to.value&&dayDifference(from.value,to.value)<=3660)
 const planned=computed(()=>validRange.value?projectedCharges(filters.matchingRows.value,from.value,to.value,filters.today.value).filter(event=>event.charge):[])
 const payments=computed(()=>sourcePayments(props.sources).filter(payment=>(filters.group.value==='all'||payment.vaultIds.includes(filters.group.value))&&(filters.currency.value==='all'||payment.currency===filters.currency.value)&&`${payment.service} ${payment.label} ${payment.vaultName}`.toLowerCase().includes(filters.search.value.trim().toLowerCase())&&validRange.value&&todayDate(new Date(payment.paidAt))>=from.value&&todayDate(new Date(payment.paidAt))<=to.value).sort((a,b)=>b.paidAt.localeCompare(a.paidAt)))
 const planTotals=computed(()=>currencyTotals(planned.value)),paidTotals=computed(()=>currencyTotals(payments.value))
 const chartOptions=currencies.map(value=>({label:value,value}))
 const monthly=computed(()=>{if(!validRange.value)return [];const months=[];let date=from.value.slice(0,7)+'-01';while(date&&date<=to.value){const key=date.slice(0,7);months.push({key,label:new Intl.DateTimeFormat('ru-RU',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),planned:Math.round(planned.value.filter(event=>event.currency===chartCurrency.value&&event.date.startsWith(key)).reduce((sum,event)=>sum+Math.round(event.amount*100),0))/100,paid:Math.round(payments.value.filter(payment=>payment.currency===chartCurrency.value&&todayDate(new Date(payment.paidAt)).startsWith(key)).reduce((sum,payment)=>sum+Math.round(payment.amount*100),0))/100});date=addPeriod(date,1,'month')}return months})
 const distribution=computed(()=>props.sources.map(source=>({key:source.id,label:source.name,value:planned.value.filter(event=>event.currency===chartCurrency.value&&(filters.group.value==='all'?event.row.entry.vaultId===source.id:filters.group.value===source.id)).reduce((sum,event)=>sum+Math.round(event.amount*100),0)/100})).filter(item=>item.value>0))
 watch(()=>filters.currency.value,value=>{if(currencies.includes(value as Currency))chartCurrency.value=value as Currency})
 const stamp=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
 return {...filters,from,to,chartCurrency,chartOptions,tab,validRange,planned,payments,planTotals,paidTotals,monthly,distribution,amountLabel,dateLabel,stamp}
}
