import type { ProjectClosing,ClosingCheck } from '../types/project-closing'
import type { ProjectProcess,ProcessContract,ProcessDocument,ProcessDocumentKind,ProcessItem,ProcessPhase,ProcessStep } from '../types/project-process'
import type { TimelineStatus } from './project-timeline'
import { projectTimeline,contractTimeline,checkDeadline } from './project-timeline'
import { requiredClosingChecks,defaultClosingKit,renderClosingDocument } from './project-closing'
import { defaultExecutionKit,renderExecutionDocument,executionMoney } from './project-execution'
import { estimateAmounts,estimateFinancials,roundMoney } from './estimate'
import { todayDate } from './subscriptions'
const labels:Record<ProcessDocumentKind,string>={contract:'Договор',appendix:'Приложение',invoice:'Счёт на предоплату',act:'Акт приёмки',upd:'УПД'}
const phaseLabels:Record<ProcessPhase,string>={parties:'Стороны',estimate:'Смета',contracts:'Договор',execution:'Исполнение',closing:'Закрытие'}
const phases:ProcessPhase[]=['parties','estimate','contracts','execution','closing']
export function buildProjectProcess(data:ProjectClosing,today=todayDate(),generatedAt=new Date().toISOString()):ProjectProcess{
 const execution=data.execution,estimate=execution.estimate,amounts=estimateAmounts(estimate.items),timeline=projectTimeline(data,today)
 const items:ProcessItem[]=estimate.items.map((item,index)=>({id:item.id,name:item.name,kind:item.kind,quantity:item.quantity,unit:item.unit,price:item.price,total:amounts[index]!.total,vat:amounts[index]!.vat,deadline:item.deadline,counterpartyId:item.counterpartyId,counterparty:estimate.counterparties.find(p=>p.id===item.counterpartyId)?.company??'',internalCost:item.internalCost,link:item.link,fields:item.fields}))
 const allocated=new Set(execution.contracts.filter(c=>c.source==='expenses').flatMap(c=>c.itemIds))
 const contracts:ProcessContract[]=execution.contracts.map(contract=>{
  const savedExecution=execution.state.kits.find(k=>k.contractId===contract.id),kit=savedExecution??defaultExecutionKit(contract.id),savedClosing=data.state.kits.find(k=>k.contractId===contract.id),closing=savedClosing??defaultClosingKit(contract)
  const progress=contractTimeline(data,closing,today),seller=estimate.counterparties.find(p=>p.id===contract.sellerId)??null,buyer=estimate.counterparties.find(p=>p.id===contract.buyerId)??null
  const stateFor=(key:ClosingCheck):TimelineStatus=>!contract.issue&&closing.confirmations[key]?'complete':checkDeadline(data,closing,key)&&checkDeadline(data,closing,key)<today?'overdue':'pending'
  const actions:Record<ClosingCheck,string>={contractSigned:`${contract.seller} и ${contract.buyer} подписывают договор`,appendicesSigned:`${contract.seller} и ${contract.buyer} согласовывают и подписывают приложения`,advancePaid:`${contract.buyer} перечисляет предоплату ${contract.seller}`,fulfilled:`${contract.seller} передаёт товары / результат работ; ${contract.buyer} принимает исполнение`,actSigned:`${contract.seller} и ${contract.buyer} подписывают акт приёмки`,updSigned:`${contract.seller} и ${contract.buyer} подписывают УПД`}
  const checks=requiredClosingChecks(data,closing).map(check=>({key:check.key,label:check.label,action:actions[check.key],confirmed:!contract.issue&&closing.confirmations[check.key],deadline:checkDeadline(data,closing,check.key),status:stateFor(check.key),at:data.audit[contract.id]?.[check.key]?.at??'',by:data.audit[contract.id]?.[check.key]?.by??''}))
  const documents:ProcessDocument[]=[]
  function document(kind:ProcessDocumentKind,number:string,date:string,automatic:boolean,key:ClosingCheck,appendixId?:string){
   let title=`${labels[kind]}${number?' № '+number:''}`,issue=contract.issue
   try{title=(kind==='act'||kind==='upd'?renderClosingDocument(data,contract.id,kind):renderExecutionDocument(execution,contract.id,kind,appendixId)).title}catch(error){issue=error instanceof Error?error.message:'Проверьте данные документа'}
   documents.push({id:`${contract.id}:${kind}${appendixId?':'+appendixId:''}`,kind,title,number,date,stage:kind==='act'||kind==='upd'?'closing':'execution',...(appendixId?{appendixId}:{}),automatic,confirmed:!contract.issue&&closing.confirmations[key],status:stateFor(key),deadline:checkDeadline(data,closing,key),confirmedAt:data.audit[contract.id]?.[key]?.at??'',confirmedBy:data.audit[contract.id]?.[key]?.by??'',issue})
  }
  document('contract',contract.number,contract.date,!savedExecution,'contractSigned')
  for(const a of kit.appendices)document('appendix',a.number,a.date,false,'appendicesSigned',a.id)
  if(kit.prepayment.enabled)document('invoice',kit.prepayment.document.number,kit.prepayment.document.date,false,'advancePaid')
  document('act',closing.act.number,closing.act.date,!savedClosing,'actSigned')
  if(closing.upd.enabled)document('upd',closing.upd.document.number,closing.upd.document.date,!savedClosing,'updSigned')
  const scope=contract.source==='revenue'?items:items.filter(item=>contract.itemIds.includes(item.id))
  const prepayment={enabled:kit.prepayment.enabled,percent:kit.prepayment.enabled?kit.prepayment.percent:0,amount:kit.prepayment.enabled?(contract.amount===null?null:roundMoney(contract.amount*kit.prepayment.percent/100)):0,vat:kit.prepayment.enabled?(contract.vatAmount===null?null:roundMoney(contract.vatAmount*kit.prepayment.percent/100)):0}
  const summaries:Record<ProcessPhase,{status:TimelineStatus;summary:string;detail:string}>={
   parties:{status:'pending',summary:contract.source==='revenue'?'Заказчик':'Поставщик',detail:`${contract.seller} → ${contract.buyer}`},
   estimate:{status:'pending',summary:contract.source==='revenue'?'Выручка сметы':`Позиций: ${scope.length}`,detail:contract.amount===null?'Требуется проверка':executionMoney(contract.amount)},
   contracts:{status:contractTimeline(data,closing,today,'contracts').status,summary:`№ ${contract.number}`,detail:kit.appendices.length?`Приложений: ${kit.appendices.length}`:'Без приложений'},
   execution:{status:contractTimeline(data,closing,today,'execution').status,summary:prepayment.enabled?`Предоплата ${prepayment.percent}%`:'Без предоплаты',detail:prepayment.enabled?(prepayment.amount===null?'Требуется проверка':executionMoney(prepayment.amount)):'Оплата без аванса'},
   closing:{status:progress.status,summary:progress.status==='complete'?'Договор закрыт':`Подтверждено ${progress.done} из ${progress.total}`,detail:closing.upd.enabled?'Акт приёмки + УПД':'Акт приёмки'}
  }
  const steps:ProcessStep[]=phases.map(phase=>({id:`${contract.id}:${phase}`,phase,label:phaseLabels[phase],...summaries[phase]}))
  return {id:contract.id,source:contract.source,number:contract.number,code:contract.code,date:contract.date,deadline:contract.deadline,amount:contract.amount,vat:contract.vatAmount,net:contract.netAmount,issue:contract.issue,seller,buyer,sellerName:contract.seller,buyerName:contract.buyer,payerId:contract.buyerId,payeeId:contract.sellerId,scopeBasis:contract.source==='revenue'?'Сумма договора определяется выручкой сметы. В составе ниже показаны затраты проекта.':'Сумма договора складывается из выбранных позиций этого поставщика.',scope,documents,checks,steps,edges:steps.slice(0,-1).map((step,index)=>({from:step.id,to:steps[index+1]!.id})),prepayment,needsReview:data.needsReview.includes(contract.id),...progress}
 }).sort((a,b)=>Number(b.source==='revenue')-Number(a.source==='revenue')||a.code.localeCompare(b.code,'ru',{numeric:true}))
 return {name:estimate.projectName,today,generatedAt,sourceRevisions:{estimate:data.estimateRevision,execution:data.executionRevision,closing:data.revision},inputDocuments:{available:false,count:null},estimate:{itemCount:items.length,...estimateFinancials(estimate),fields:estimate.details.fields},parties:estimate.counterparties,contracts,internalItems:items.filter(item=>item.internalCost),unallocatedItems:items.filter(item=>!item.internalCost&&!allocated.has(item.id)),stages:timeline.stages,documentCount:contracts.reduce((total,c)=>total+c.documents.length,0)}
}
