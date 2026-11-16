import { addPeriod } from './subscriptions'

export function calendarDates(month: string) {
  const first = month.slice(0,7) + '-01'
  const weekday = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = addPeriod(first,index-weekday,'day')
    return {date,day:Number(date.slice(-2)),outside:date.slice(0,7)!==first.slice(0,7)}
  })
}
