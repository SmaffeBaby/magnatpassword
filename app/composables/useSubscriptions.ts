import { addPeriod, todayDate, subscriptionRows, dateLabel, moneyLabel, periodLabel } from '~~/shared/utils/subscriptions'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
export function useSubscriptions(props:{entries:ScopedCredential[]}) {
 const today=useState('subscription-today',()=>todayDate())
 const rows=computed(()=>subscriptionRows(props.entries,today.value))
 const status=(days:number)=>days<0?`Просрочено на ${-days} дн.`:days===0?'Срок истекает сегодня':`Осталось ${days} дн.`
 return {today,rows,status,dateLabel,moneyLabel,periodLabel}
}
export function useSubscriptionSummary(props:{entry:ScopedCredential}) {
 return useSubscriptions({get entries(){return [props.entry]}})
}
export function useSubscriptionSidebar(props:{entries:ScopedCredential[]}) {
 const common=useSubscriptions(props)
 const upcoming=computed(()=>common.rows.value.slice(0,5))
 return {...common,upcoming}
}
export function useSubscriptionCalendar(props:{entries:ScopedCredential[]}) {
 const common=useSubscriptions(props), month=ref(common.today.value.slice(0,7)+'-01'), selected=ref(common.today.value)
 const monthTitle=computed(()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month.value+'T12:00:00Z')))
 const cells=computed(()=>{const weekday=(new Date(month.value+'T12:00:00Z').getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>{const date=addPeriod(month.value,i-weekday,'day');return {date,day:Number(date.slice(-2)),outside:date.slice(0,7)!==month.value.slice(0,7),events:common.rows.value.filter(row=>row.subscription.paidUntil===date)}})})
 const selectedRows=computed(()=>common.rows.value.filter(row=>row.subscription.paidUntil===selected.value))
 function move(delta:number){month.value=addPeriod(month.value,delta,'month')}
 function goToday(){month.value=common.today.value.slice(0,7)+'-01';selected.value=common.today.value}
 return {...common,month,selected,monthTitle,cells,selectedRows,move,goToday}
}
