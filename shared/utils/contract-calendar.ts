import type { RegisterContract } from '../types/contract-register'
import { calendarDates } from './calendar'
import { validDate } from './subscriptions'

export type ContractCalendarKind = 'all' | 'date' | 'deadline'
export interface ContractCalendarEvent { key: string; date: string; kind: 'date' | 'deadline'; contract: RegisterContract }

export function contractCalendarEvents(contracts: RegisterContract[], kind: ContractCalendarKind = 'all'): ContractCalendarEvent[] {
  return contracts.flatMap(contract => {
    const events: ContractCalendarEvent[]=[]
    const key=`${contract.origin}/${contract.id}`
    if(kind!=='deadline'&&validDate(contract.date))events.push({key:key+'/date',date:contract.date,kind:'date',contract})
    if(kind!=='date'&&!contract.noDeadline&&validDate(contract.deadline))events.push({key:key+'/deadline',date:contract.deadline,kind:'deadline',contract})
    return events
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.contract.number.localeCompare(b.contract.number,'ru',{numeric:true})||a.key.localeCompare(b.key))
}

export function contractCalendarSlice(contracts: RegisterContract[], month: string, kind: ContractCalendarKind) {
  const dates=calendarDates(month),from=dates[0]!.date,until=dates.at(-1)!.date
  const events=contractCalendarEvents(contracts,kind)
  const visible=new Set(events.filter(event=>event.date>=from&&event.date<=until).map(event=>`${event.contract.origin}/${event.contract.id}`))
  const dated=new Set(events.map(event=>`${event.contract.origin}/${event.contract.id}`))
  return {contracts:contracts.filter(contract=>visible.has(`${contract.origin}/${contract.id}`)),total:contracts.length,withoutDates:contracts.filter(contract=>!dated.has(`${contract.origin}/${contract.id}`)).length}
}
