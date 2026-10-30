import type { ClosingCheck, ClosingKit, ProjectClosing } from '../types/project-closing'
import { defaultClosingKit, requiredClosingChecks } from './project-closing'
import { todayDate } from './subscriptions'
export type TimelineStatus='pending'|'complete'|'overdue'
export type TrackedStage='contracts'|'execution'|'closing'
export interface TimelineProgress {status:TimelineStatus;done:number;total:number;overdueCount:number;nextDue:string}
export interface ContractTimeline extends TimelineProgress {id:string;number:string;seller:string;buyer:string;source:'revenue'|'expenses';deadline:string;stages:Record<TrackedStage,TimelineProgress>}
export interface ProjectTimeline {today:string;contracts:ContractTimeline[];stages:Record<TrackedStage,TimelineProgress>}
export function checkDeadline(data:Pick<ProjectClosing,'execution'>,kit:ClosingKit,key:ClosingCheck){
 const override=kit.deadlines?.[key]
 return override===undefined?(data.execution.contracts.find(c=>c.id===kit.contractId)?.deadline??''):override
}
export function contractTimeline(data:Pick<ProjectClosing,'execution'>,kit:ClosingKit,today=todayDate(),stage:TrackedStage='closing'):TimelineProgress{
 const required=requiredClosingChecks(data,kit).filter(check=>stage==='contracts'?['contractSigned','appendicesSigned'].includes(check.key):stage==='execution'?['advancePaid','fulfilled'].includes(check.key):true)
 const open=required.filter(check=>!kit.confirmations[check.key]),done=required.length-open.length
 const dates=open.map(check=>checkDeadline(data,kit,check.key)).filter(Boolean).sort()
 const overdueCount=dates.filter(date=>date<today).length
 const invalid=!!data.execution.contracts.find(c=>c.id===kit.contractId)?.issue
 return {status:!invalid&&required.length>0&&!open.length?'complete':overdueCount?'overdue':'pending',done,total:required.length,overdueCount,nextDue:dates[0]??''}
}
export function projectTimeline(data:Pick<ProjectClosing,'execution'|'state'>,today=todayDate()):ProjectTimeline{
 const contracts=data.execution.contracts.map(c=>{const kit=data.state.kits.find(k=>k.contractId===c.id)??defaultClosingKit(c);return {id:c.id,number:c.number,seller:c.seller,buyer:c.buyer,source:c.source,deadline:c.deadline,...contractTimeline(data,kit,today),stages:{contracts:contractTimeline(data,kit,today,'contracts'),execution:contractTimeline(data,kit,today,'execution'),closing:contractTimeline(data,kit,today,'closing')}}})
 const aggregate=(stage:TrackedStage):TimelineProgress=>{const rows=contracts.map(c=>c.stages[stage]);return {status:rows.length&&rows.every(r=>r.status==='complete')?'complete':rows.some(r=>r.status==='overdue')?'overdue':'pending',done:rows.reduce((sum,r)=>sum+r.done,0),total:rows.reduce((sum,r)=>sum+r.total,0),overdueCount:rows.reduce((sum,r)=>sum+r.overdueCount,0),nextDue:rows.map(r=>r.nextDue).filter(Boolean).sort()[0]??''}}
 return {today,contracts,stages:{contracts:aggregate('contracts'),execution:aggregate('execution'),closing:aggregate('closing')}}
}
export function timelineLabel(value:TimelineProgress){return value.status==='complete'?'Всё закрыто':value.status==='overdue'?`Просрочено пунктов: ${value.overdueCount}`:`Подтверждено ${value.done} из ${value.total}`}
