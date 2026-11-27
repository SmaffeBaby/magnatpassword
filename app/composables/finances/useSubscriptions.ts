import { useMonthCalendar } from '~/composables/shared/useMonthCalendar'
import type { VaultSource } from '~~/shared/types/sharing'
import { unpaidProjectedCharges, sourcePayments, recordedCharges, currencyTotals, amountLabel } from '~~/shared/utils/subscription-finances'
import { addPeriod, todayDate, subscriptionRows, subscriptionCardReferences, subscriptionCardKey, matchesSubscriptionCard, dateLabel, moneyLabel, periodLabel, subscriptionEnded } from '~~/shared/utils/subscriptions'
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
  const linkedCards=(row.subscription.linkedCards??[]).map(card=>{const entry=(props.entries??[props.entry]).find(entry=>matchesSubscriptionCard(card,entry));return {key:subscriptionCardKey(card),entry,title:entry?.title??'Недоступная карточка'}})
  return {...row,owner:!sameCard(row.entry,props.entry)?row.entry.title:'',primaryEntry:primary,primaryTitle:primary?.title??'Недоступная карточка',linkedCards}
 }))
 return {...common,rows}
}
export function useSubscriptionSidebar(props:{entries:ScopedCredential[]}) {
 const common=useSubscriptions(props)
 const upcoming=computed(()=>common.rows.value.filter(row=>!subscriptionEnded(row.subscription,common.today.value)).slice(0,5))
 return {...common,upcoming}
}
export function useSubscriptionCalendar(props:{entries:ScopedCredential[];sources?:VaultSource[]}) {
 const common=useSubscriptionFilters(props,'calendar')
 const {month,selected}=toRefs(useFiltersStore().calendar)
 const calendar=useMonthCalendar(month,selected,common.today)
 const {monthTitle,move,goToday}=calendar
 const payments=computed(()=>sourcePayments(props.sources??[]))
 const charges=computed(()=>{
  const from=addPeriod(month.value,-6,'day'),to=addPeriod(month.value,42,'day')
  const planned=unpaidProjectedCharges(common.matchingRows.value,payments.value,from,to,common.today.value).map(event=>({...event,ending:false,paid:false,available:true,payment:undefined}))
  const paid=recordedCharges(payments.value,props.entries).filter(event=>event.date>=from&&event.date<=to&&(common.group.value==='all'||event.payment.vaultIds.includes(common.group.value))&&(common.currency.value==='all'||event.currency===common.currency.value)&&`${event.payment.service} ${event.payment.label} ${event.payment.vaultNames.join(' ')}`.toLowerCase().includes(common.search.value.trim().toLowerCase())).map(event=>({...event,ending:false}))
  const endings=common.matchingRows.value.flatMap(row=>{
   const date=row.subscription.endsOn
   return date && date>=from && date<=to ? [{key:`ending/${row.key}/${date}`,row,date,amount:0,currency:row.subscription.currency,ending:true,charge:false,forecast:false,paid:false,available:true,payment:undefined}] : []
  })
  return [...planned,...paid,...endings].sort((a,b)=>a.date.localeCompare(b.date))
 })
 const cells=computed(()=>calendar.dates.value.map(cell=>{const events=charges.value.filter(event=>event.date===cell.date);return {...cell,events,totals:currencyTotals(events.filter(event=>!event.paid&&!event.ending).map(event=>({amount:event.amount,currency:event.currency})))}}))
 const selectedRows=computed(()=>charges.value.filter(event=>event.date===selected.value))
 const monthTotals=computed(()=>currencyTotals(charges.value.filter(event=>event.charge&&!event.paid&&event.date.slice(0,7)===month.value.slice(0,7))))
 const monthRenewalTotals=computed(()=>currencyTotals(charges.value.filter(event=>!event.paid&&!event.ending&&event.date.slice(0,7)===month.value.slice(0,7))))
 const selectedTotals=computed(()=>currencyTotals(selectedRows.value.filter(event=>event.charge&&!event.paid)))
 const monthPaidTotals=computed(()=>currencyTotals(charges.value.filter(event=>event.paid&&event.date.slice(0,7)===month.value.slice(0,7))))
 const selectedEndingTotals=computed(()=>currencyTotals(selectedRows.value.filter(event=>!event.charge&&!event.paid&&!event.ending)))
 const selectedPaidTotals=computed(()=>currencyTotals(selectedRows.value.filter(event=>event.paid)))
 return {...common,month,selected,monthTitle,cells,selectedRows,move,goToday,monthTotals,monthRenewalTotals,selectedTotals,monthPaidTotals,selectedPaidTotals,selectedEndingTotals,amountLabel}
}
