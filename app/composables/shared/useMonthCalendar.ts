import type { Ref } from 'vue'
import { addPeriod } from '~~/shared/utils/subscriptions'
import { calendarDates } from '~~/shared/utils/calendar'

export function useMonthCalendar(month: Ref<string>, selected: Ref<string>, today: Ref<string>) {
  const monthTitle=computed(()=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month.value+'T12:00:00Z')))
  const dates=computed(()=>calendarDates(month.value))
  function move(delta:number){const next=addPeriod(month.value,delta,'month');if(next&&Number(next.slice(0,4))>=1900&&Number(next.slice(0,4))<=9998)month.value=next}
  function goToday(){month.value=today.value.slice(0,7)+'-01';selected.value=today.value}
  watch(month,value=>{if(selected.value.slice(0,7)!==value.slice(0,7))selected.value=value})
  return {month,selected,monthTitle,dates,move,goToday}
}
