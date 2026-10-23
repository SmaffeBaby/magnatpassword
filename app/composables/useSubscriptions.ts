import { projectedCharges, currencyTotals, amountLabel } from '~~/shared/utils/subscription-finances'
import { addPeriod, todayDate, subscriptionRows, subscriptionCardReferences, matchesSubscriptionCard, dateLabel, moneyLabel, periodLabel } from '~~/shared/utils/subscriptions'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
export function useSubscriptions(props:{entries:ScopedCredential[]}) {
 const today=useState('subscription-today',()=>todayDate())
 const rows=computed(()=>subscriptionRows(props.entries,today.value))
 const status=(days:number)=>days<0?`Просрочено на ${-days} дн.`:days===0?'Срок истекает сегодня':`Осталось ${days} дн.`
 return {today,rows,status,dateLabel,moneyLabel,periodLabel}
}
export function useSubscriptionSummary(props:{entry:ScopedCredential;entries?:ScopedCredential[]}) {
 const common=useSubscriptions({get entries(){return props.entries??[props.entry]}})
 const sameCard=(a:ScopedCredential,b:ScopedCredential)=>a.sharedCardId&&b.sharedCardId?a.sharedCardId===b.sharedCardId:a.id===b.id&&(a.vaultIds??[a.vaultId]).some(id=>(b.vaultIds??[b.vaultId]).includes(id))
 const rows=computed(()=>common.rows.value.filter(row=>sameCard(row.entry,props.entry)||subscriptionCardReferences(row.subscription).some(card=>matchesSubscriptionCard(card,props.entry))).map(row=>{
  const primary=row.subscription.primaryCard?(props.entries??[props.entry]).find(entry=>matchesSubscriptionCard(row.subscription.primaryCard!,entry)):row.entry
  const linked=(row.subscription.linkedCards??[]).map(card=>(props.entries??[props.entry]).find(entry=>matchesSubscriptionCard(card,entry))?.title??'Недоступная карточка')
  return {...row,owner:!sameCard(row.entry,props.entry)?row.entry.title:'',primaryTitle:primary?.title??'Недоступная карточка',linkedTitles:linked}
 }))
 return {...common,rows}
}
export function useSubscriptionSidebar(props:{entries:ScopedCredential[]}) {
 const common=useSubscriptions(props)
 const upcoming=computed(()=>common.rows.value.slice(0,5))
 return {...common,upcoming}
}
export function useSubscriptionCalendar(props:{entries:ScopedCredential[]}) {
 const common=useSubscriptionFilters(props,'calendar')
 const {month,selected}=toRefs(useFiltersStore().calendar)
 const monthTitle=computed(()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month.value+'T12:00:00Z')))
 const selectedMonth=computed({get:()=>month.value.slice(5,7),set:value=>{month.value=month.value.slice(0,5)+value+'-01'}})
 const selectedYear=computed({get:()=>Number(month.value.slice(0,4)),set:value=>{if(Number.isInteger(value)&&value>=1900&&value<=9998)month.value=String(value).padStart(4,'0')+month.value.slice(4)}})
 const monthOptions=Array.from({length:12},(_,i)=>({label:new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1))),value:String(i+1).padStart(2,'0')}))
 const charges=computed(()=>projectedCharges(common.matchingRows.value,addPeriod(month.value,-6,'day'),addPeriod(month.value,42,'day'),common.today.value))
 const cells=computed(()=>{const weekday=(new Date(month.value+'T12:00:00Z').getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>{const date=addPeriod(month.value,i-weekday,'day'),events=charges.value.filter(event=>event.date===date);return {date,day:Number(date.slice(-2)),outside:date.slice(0,7)!==month.value.slice(0,7),events,totals:currencyTotals(events.filter(event=>event.charge).map(event=>({amount:event.amount,currency:event.currency})))}})})
 const selectedRows=computed(()=>charges.value.filter(event=>event.date===selected.value))
 const monthTotals=computed(()=>currencyTotals(charges.value.filter(event=>event.charge&&event.date.slice(0,7)===month.value.slice(0,7))))
 const selectedTotals=computed(()=>currencyTotals(selectedRows.value.filter(event=>event.charge)))
 function move(delta:number){const next=addPeriod(month.value,delta,'month');if(next)month.value=next}
 function goToday(){month.value=common.today.value.slice(0,7)+'-01';selected.value=common.today.value}
 watch(month,value=>{selected.value=value})
 return {...common,month,selected,monthTitle,cells,selectedRows,move,goToday,selectedMonth,selectedYear,monthOptions,monthTotals,selectedTotals,amountLabel}
}
