import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { ClosingKit,ClosingState,ClosingCheck,ClosingAudit,ProjectClosing } from '../../shared/types/project-closing'
import type { ProjectExecution } from '../../shared/types/project-execution'
import { defaultClosingState,closingStateSchema,emptyClosingChecks,requiredClosingChecks } from '../../shared/utils/project-closing'
import { defaultExecutionKit } from '../../shared/utils/project-execution'
import { projectExecution } from './project-execution'
import { projectFailure,projectId,requireProjectsUser } from './projects'
import { openSharedVault,sealSharedVault } from './shared-crypto'
import { sharedSecret } from './shared-vaults'
type Proof={fingerprint:string;checks:Partial<Record<ClosingCheck,ClosingAudit>>}
type Stored={state:ClosingState;proofs:Record<string,Proof>}
function fingerprint(execution:ProjectExecution,state:ClosingState,kit:ClosingKit){
 const contract=execution.contracts.find(c=>c.id===kit.contractId)
 const documentKit=execution.state.kits.find(k=>k.contractId===kit.contractId)??defaultExecutionKit(kit.contractId)
 return createHash('sha256').update(JSON.stringify({contract,parties:execution.estimate.counterparties.filter(p=>[contract?.sellerId,contract?.buyerId].includes(p.id)),items:execution.estimate.items.filter(item=>contract?.source==='revenue'?!item.internalCost:contract?.itemIds.includes(item.id)),project:execution.estimate.projectName,executionKit:documentKit,executionTemplates:execution.state.templates,templates:state.templates,act:kit.act,upd:kit.upd})).digest('hex')
}
async function readClosing(event:H3Event){
 const context=await requireProjectsUser(event),id=projectId(event)
 for(let attempt=0;attempt<3;attempt++){
  const execution=await projectExecution(event)
  const {data,error}=await context.client.rpc('project_closing_read',{p_actor:context.user.id,p_project:id});if(error)projectFailure(error)
  if(data.estimateRevision!==execution.estimateRevision||data.executionRevision!==execution.revision)continue
  const value=data.encryptedData?openSharedVault(data.encryptedData,sharedSecret(event),`project-closing:${id}`,1) as Stored:null
  const stored:Stored=value?{state:closingStateSchema.parse(value.state),proofs:value.proofs??{}}:{state:defaultClosingState(),proofs:{}}
  return {execution,stored,revision:data.revision as number}
 }
 throw createError({statusCode:409,message:'Данные изменились. Обновите страницу.'})
}
export async function projectClosing(event:H3Event):Promise<ProjectClosing>{
 const {execution,stored,revision}=await readClosing(event),state=structuredClone(stored.state),needsReview:string[]=[],audit:ProjectClosing['audit']={}
 for(const kit of state.kits){
  const proof=stored.proofs[kit.contractId],valid=proof?.fingerprint===fingerprint(execution,state,kit)
  if(!valid&&Object.values(kit.confirmations).some(Boolean)){needsReview.push(kit.contractId);kit.confirmations=emptyClosingChecks()}
  audit[kit.contractId]=valid?proof.checks:{}
 }
 return {revision,estimateRevision:execution.estimateRevision,executionRevision:execution.revision,state,execution,needsReview,audit}
}
export async function saveProjectClosing(event:H3Event,revision:number,estimateRevision:number,executionRevision:number,state:ClosingState){
 if(JSON.stringify(state).length>1_500_000)throw createError({statusCode:413,message:'Документы слишком большие. Сократите текст.'})
 const context=await requireProjectsUser(event),id=projectId(event),current=await readClosing(event)
 if(current.revision!==revision||current.execution.revision!==executionRevision||current.execution.estimateRevision!==estimateRevision)throw createError({statusCode:409,message:'Данные изменились. Загрузите актуальные документы перед сохранением.'})
 const proofs:Record<string,Proof>={}
 for(const kit of state.kits){
  const contract=current.execution.contracts.find(c=>c.id===kit.contractId)
  if(!contract||contract.issue)throw createError({statusCode:400,message:'Проверьте договор и смету.'})
  const allowed=new Set(requiredClosingChecks(current,kit).map(c=>c.key))
  if(Object.entries(kit.confirmations).some(([key,checked])=>checked&&!allowed.has(key as ClosingCheck)))throw createError({statusCode:400,message:'Подтверждайте только документы, включённые в комплект.'})
  const hash=fingerprint(current.execution,state,kit),previous=current.stored.proofs[kit.contractId],checks:Proof['checks']={}
  for(const [key,checked]of Object.entries(kit.confirmations))if(checked){const k=key as ClosingCheck;checks[k]=previous?.fingerprint===hash&&previous.checks[k]?previous.checks[k]:{at:new Date().toISOString(),by:context.user.id}}
  proofs[kit.contractId]={fingerprint:hash,checks}
 }
 const {error}=await context.client.rpc('project_closing_write',{p_actor:context.user.id,p_project:id,p_revision:revision,p_estimate_revision:estimateRevision,p_execution_revision:executionRevision,p_contracts:state.kits.map(k=>k.contractId),p_data:sealSharedVault({state,proofs},sharedSecret(event),`project-closing:${id}`,1)})
 if(error)projectFailure(error)
 return {ok:true}
}
