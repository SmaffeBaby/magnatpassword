import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import type { ExecutionRendered, ExecutionState, ProjectExecution } from '../../shared/types/project-execution'
import { defaultExecutionState, executionStateSchema } from '../../shared/utils/project-execution'
import { projectContractRegistry } from './project-contracts'
import { openSharedVault, sealSharedVault } from './shared-crypto'
import { projectFailure, projectId, requireProjectsUser } from './projects'
export async function projectExecution(event: H3Event): Promise<ProjectExecution> {
 const context=await requireProjectsUser(event),id=projectId(event)
 for(let attempt=0;attempt<3;attempt++){
  const {estimate,contracts}=await projectContractRegistry(event)
  const {data,error}=await context.client.rpc('project_execution_read',{p_actor:context.user.id,p_project:id})
  if(error)projectFailure(error)
  if(estimate.revision!==data.estimateRevision)continue
  const state=data.encryptedData?executionStateSchema.parse(openSharedVault(data.encryptedData,sharedSecret(event),`project-execution:${id}`,1)):defaultExecutionState()
  return {revision:data.revision,estimateRevision:estimate.revision,state,contracts:[...contracts].sort((a,b)=>Number(b.source==='revenue')-Number(a.source==='revenue')||a.code.localeCompare(b.code,'ru',{numeric:true})),estimate}
 }
 throw createError({statusCode:409,message:'Данные проекта изменились. Обновите страницу.'})
}
export async function saveProjectExecution(event:H3Event,revision:number,estimateRevision:number,state:ExecutionState){
 if(JSON.stringify(state).length>1_500_000)throw createError({statusCode:413,message:'Документы слишком большие. Сократите текст или число приложений.'})
 const context=await requireProjectsUser(event),id=projectId(event),snapshot=await projectExecution(event)
 if(snapshot.estimateRevision!==estimateRevision||snapshot.revision!==revision)throw createError({statusCode:409,message:'Данные изменились. Обновите страницу перед сохранением.'})
 if(state.kits.some(kit=>!snapshot.contracts.some(row=>row.id===kit.contractId&&!row.issue)))throw createError({statusCode:400,message:'Проверьте связанные договоры и смету.'})
 const {error}=await context.client.rpc('project_execution_write',{p_actor:context.user.id,p_project:id,p_revision:revision,p_estimate_revision:estimateRevision,p_contracts:state.kits.map(kit=>kit.contractId),p_data:sealSharedVault(state,sharedSecret(event),`project-execution:${id}`,1)})
 if(error)projectFailure(error)
 return {ok:true}
}
export async function renderExecutionFile(snapshot:ExecutionRendered,format:'docx'|'pdf'):Promise<Buffer>{
 return new Promise((done,reject)=>{
  const renderer=spawn(process.env.FINANCE_REPORT_PYTHON||'python3',[resolve('scripts/project-execution.py'),format],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}})
  const chunks:Buffer[]=[];let size=0,failed=false
  const fail=()=>{if(failed)return;failed=true;clearTimeout(timer);renderer.kill();reject(createError({statusCode:503,message:'Не удалось сформировать документ. Повторите попытку.'}))}
  const timer=setTimeout(fail,60000)
  renderer.on('error',fail);renderer.stdin.on('error',fail);renderer.stderr.resume()
  renderer.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>30*1024*1024)fail();else chunks.push(chunk)})
  renderer.on('close',code=>{clearTimeout(timer);if(failed)return;if(code||!size){fail();return}done(Buffer.concat(chunks))})
  renderer.stdin.end(JSON.stringify(snapshot))
 })
}
