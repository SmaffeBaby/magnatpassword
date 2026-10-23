import type { Currency, Subscription, SubscriptionPayment } from '../types/subscriptions'
import type { VaultSource } from '../types/sharing'
import { addPeriod, dayDifference, subscriptionRows, todayDate } from './subscriptions'
export const currencies: Currency[] = ['RUB','USD','EUR','CNY']
export const amountLabel = (amount: number, currency: Currency) => new Intl.NumberFormat('ru-RU',{style:'currency',currency,maximumFractionDigits:2}).format(amount)
export function currencyTotals(items: {amount:number;currency:Currency}[]) {
 return currencies.map(currency=>({currency,amount:Math.round(items.filter(item=>item.currency===currency).reduce((sum,item)=>sum+Math.round(item.amount*100),0))/100})).filter(total=>items.some(item=>item.currency===total.currency))
}
export type SubscriptionRow = ReturnType<typeof subscriptionRows>[number]
// Project calendar renewals from the original anchor, including short months and leap years.
export function scheduledDates(sub: Subscription, from: string, to: string) {
 if (from>to) return []
 if (!sub.autoRenew) return sub.paidUntil>=from&&sub.paidUntil<=to?[sub.paidUntil]:[]
 const distance=(a:string,b:string)=>sub.periodUnit==='day'?dayDifference(a,b):(Number(b.slice(0,4))-Number(a.slice(0,4)))*12+Number(b.slice(5,7))-Number(a.slice(5,7))
 const step=sub.periodCount*(sub.periodUnit==='year'?12:1), originalOffset=distance(sub.startsOn,sub.paidUntil)/step
 const regular=Number.isInteger(originalOffset)&&originalOffset>=0&&addPeriod(sub.startsOn,originalOffset*sub.periodCount,sub.periodUnit)===sub.paidUntil
 const anchor=regular?sub.startsOn:sub.paidUntil, offset=regular?originalOffset:0
 let index=Math.max(offset,Math.floor(distance(anchor,from)/step)-1), date=addPeriod(anchor,index*sub.periodCount,sub.periodUnit)
 const dates:string[]=[]
 while(date&&date<=to){if(date>=from&&date>=sub.paidUntil)dates.push(date); index++;const next=addPeriod(anchor,index*sub.periodCount,sub.periodUnit);if(next<=date)break;date=next}
 return dates
}
export function projectedCharges(rows:SubscriptionRow[],from:string,to:string,today=todayDate()) {
 return rows.flatMap(row=>{
  const dates=scheduledDates(row.subscription,from>today?from:today,to)
  if(row.subscription.paidUntil<today&&row.subscription.paidUntil>=from&&row.subscription.paidUntil<=to)dates.unshift(row.subscription.paidUntil)
  return dates.map(date=>({key:`${row.key}/${date}`,row,date,amount:row.subscription.price,currency:row.subscription.currency,charge:row.subscription.autoRenew,forecast:date!==row.subscription.paidUntil}))
 }).sort((a,b)=>a.date.localeCompare(b.date))
}
export function sourcePayments(sources:VaultSource[]) {
 const result:(SubscriptionPayment&{vaultId:string;vaultName:string;vaultIds:string[];vaultNames:string[]})[]=[],seen=new Map<string,typeof result[number]>()
 for(const source of sources)for(const payment of source.data.subscriptionPayments??[]){
  const key=payment.sharedCardId?`${payment.sharedCardId}/${payment.id}`:''
  if(key&&seen.has(key)){const current=seen.get(key)!;current.vaultIds.push(source.id);current.vaultNames.push(source.name);continue}
  const value={...payment,vaultId:source.id,vaultName:source.name,vaultIds:[source.id],vaultNames:[source.name]};result.push(value);if(key)seen.set(key,value)
 }
 return result
}
export function paymentForRenewal(row:SubscriptionRow,until:string,id:string,now=new Date().toISOString()):SubscriptionPayment {
 return {id,entryId:row.entry.id,fieldId:row.field.id,service:row.entry.title,label:row.field.label,amount:row.subscription.price,currency:row.subscription.currency,paidAt:now,periodFrom:row.subscription.paidUntil,periodUntil:until}
}
