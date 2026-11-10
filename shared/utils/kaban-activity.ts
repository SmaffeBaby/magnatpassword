import type { KabanTaskData } from '../types/kaban'
import type { ActivityCounts, ActivityDay, ActivityFilter } from '../types/kaban-activity'
import { kabanBlocks, kabanBlockSummary } from './kaban'
export const emptyActivityCounts=():ActivityCounts=>({created:0,completed:0,updated:0,moved:0,checklist:0,files:0,restored:0,deleted:0})
export function activityChanges(previous:KabanTaskData|null,next:KabanTaskData,id:string){
 if(!previous)return {content:false,checklist:false,checked:0,deadline:false}
 const before=kabanBlocks(previous,id),after=kabanBlocks(next,id)
 const structure=(blocks:typeof before)=>blocks.map(block=>{const base={id:block.id,type:block.type,title:block.title};if(block.type==='description'||block.type==='link')return {...base,value:block.value};if(block.type==='password')return {...base,vaultId:block.vaultId,entryId:block.entryId};return base})
 const a=kabanBlockSummary(before).todos,b=kabanBlockSummary(after).todos
 return {deadline:previous.dueOn!==next.dueOn,content:previous.title!==next.title||JSON.stringify(structure(before))!==JSON.stringify(structure(after)),checklist:JSON.stringify(a)!==JSON.stringify(b),checked:b.filter(item=>item.done&&!a.find(old=>old.id===item.id)?.done).length}
}
export const activityValue=(day:ActivityDay|undefined,filter:ActivityFilter)=>day?(filter==='all'?day.total:day.kinds[filter]):0
export const activityLevel=(count:number)=>count>=10?4:count>=6?3:count>=3?2:count>0?1:0
const key=(date:Date)=>date.toISOString().slice(0,10)
export function activityCalendar(year:number,today:string){
 const start=new Date(Date.UTC(year,0,1)),end=new Date(Date.UTC(year,11,31)),weekStart=new Date(start)
 weekStart.setUTCDate(weekStart.getUTCDate()-weekStart.getUTCDay())
 const weeks=Math.ceil(((end.getTime()-weekStart.getTime())/86400000+1)/7)
 return Array.from({length:weeks*7},(_,index)=>{const date=new Date(weekStart);date.setUTCDate(date.getUTCDate()+index);const value=key(date);return {date:value,week:Math.floor(index/7),weekday:index%7,inYear:date.getUTCFullYear()===year,future:value>today,month:date.getUTCMonth(),monthStart:date.getUTCDate()===1}})
}
export function activitySummary(days:ActivityDay[],filter:ActivityFilter,today:string){
 const past=days.filter(day=>day.date<=today)
 const active=past.filter(day=>activityValue(day,filter)>0).sort((a,b)=>a.date.localeCompare(b.date))
 let longest=0,streak=0,previous=''
 for(const day of active){const next=new Date(day.date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()-1);streak=key(next)===previous?streak+1:1;longest=Math.max(longest,streak);previous=day.date}
 return {total:active.reduce((sum,day)=>sum+activityValue(day,filter),0),activeDays:active.length,longest,checked:past.reduce((sum,day)=>sum+day.checked,0),created:past.reduce((sum,day)=>sum+day.kinds.created,0),completed:past.reduce((sum,day)=>sum+day.kinds.completed,0)}
}
