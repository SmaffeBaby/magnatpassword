import type { CustomField } from '~~/shared/types/vault'
import {addPeriod,todayDate} from '~~/shared/utils/subscriptions'
export function useSubscriptionEditor(props:{field:CustomField}){
 const sub=computed(()=>props.field.subscription!)
 const currencies=[{label:'Рубли · RUB',value:'RUB'},{label:'Доллары · USD',value:'USD'},{label:'Евро · EUR',value:'EUR'},{label:'Юани · CNY',value:'CNY'}]
 const units=[{label:'Дней',value:'day'},{label:'Месяцев',value:'month'},{label:'Лет',value:'year'}]
 function updatePeriod(){if(!sub.value)return;const next=addPeriod(sub.value.startsOn,sub.value.periodCount,sub.value.periodUnit);if(next){sub.value.paidUntil=next;sub.value.paidFrom=sub.value.startsOn}}
 function toggleReminders(enabled:boolean){sub.value.reminders=enabled?{leadDays:[7,1,0],repeatEveryDays:0,customDates:[]}:undefined}
 function addLead(){if(sub.value.reminders&&sub.value.reminders.leadDays.length<12)sub.value.reminders.leadDays.push(1)}
 function addDate(){if(sub.value.reminders&&sub.value.reminders.customDates.length<12)sub.value.reminders.customDates.push(todayDate())}
 watch(()=>[sub.value?.startsOn,sub.value?.periodCount,sub.value?.periodUnit],updatePeriod)
 return {sub,currencies,units,toggleReminders,addLead,addDate}
}
