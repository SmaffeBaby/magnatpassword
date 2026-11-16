import type { Ref } from 'vue'
import { addPeriod } from '~~/shared/utils/subscriptions'
import { calendarDates } from '~~/shared/utils/calendar'

export function useMonthCalendar(month: Ref<string>, selected: Ref<string>, today: Ref<string>) {
  const monthTitle=computed(()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month.value+'T12:00:00Z')))
  const selectedMonth=computed({get:()=>month.value.slice(5,7),set:(value:string)=>{if(/^(0[1-9]|1[0-2])$/.test(value))month.value=month.value.slice(0,5)+value+'-01'}})
  const selectedYear=computed({get:()=>Number(month.value.slice(0,4)),set:(value:number)=>{if(Number.isInteger(value)&&value>=1900&&value<=9998)month.value=String(value).padStart(4,'0')+month.value.slice(4)}})
  const monthOptions=Array.from({length:12},(_,i)=>({label:new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1))),value:String(i+1).padStart(2,'0')}))
  const dates=computed(()=>calendarDates(month.value))
  function move(delta:number){const next=addPeriod(month.value,delta,'month');if(next&&Number(next.slice(0,4))>=1900&&Number(next.slice(0,4))<=9998)month.value=next}
  function goToday(){month.value=today.value.slice(0,7)+'-01';selected.value=today.value}
  watch(month,value=>{if(selected.value.slice(0,7)!==value.slice(0,7))selected.value=value})
  return {month,selected,monthTitle,selectedMonth,selectedYear,monthOptions,dates,move,goToday}
}
