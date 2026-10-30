import type { H3Event } from 'h3'
import { z } from 'zod'
import type { EstimateContent } from '../../shared/types/estimate'
import type { ProjectContractInput, StoredProjectContract } from '../../shared/types/project-contracts'
import { projectContractSchema, contractFigures, contractConflict } from '../../shared/utils/project-contracts'
import { sealSharedVault, openSharedVault } from './shared-crypto'
type Context=Awaited<ReturnType<typeof requireProjectsUser>>
export function contractFailure(error:{message:string;code?:string}){
 if(error.code==='23503')throw createError({statusCode:409,message:'У договора есть документы исполнения или закрытия. Сначала сбросьте соответствующие комплекты документов.'})
 if(error.code==='23505')throw createError({statusCode:409,message:'Договор на выручку или одна из позиций уже используются в другом договоре.'})
 const messages:Record<string,string>={CONTRACT_BOTH_OWN:'Договор между двумя нашими юридическими лицами запрещён. Сначала измените стороны или удалите договор.',CONTRACT_SAME_PARTY:'Стороны договора должны различаться',CONTRACT_PARTY_NOT_LINKED:'Выберите стороны из компаний проекта',COMPANY_CONTRACT_IN_USE:'Компания используется в договоре. Сначала измените или удалите договор.'}
 const match=Object.entries(messages).find(([key])=>error.message.includes(key))
 if(match)throw createError({statusCode:400,message:match[1]})
 projectFailure(error)
}
export function contractId(event:H3Event){const parsed=z.uuid().safeParse(getRouterParam(event,'contractId'));if(!parsed.success)throw createError({statusCode:400,message:'Некорректный договор'});return parsed.data}
export async function storedProjectContracts(event:H3Event,context:Context,id:string){
 const{data,error}=await context.client.rpc('project_contract_list',{p_actor:context.user.id,p_project:id});if(error)contractFailure(error)
 return {estimateRevision:data.estimateRevision as number,contracts:(data.contracts as any[]).map(row=>({...projectContractSchema.parse(openSharedVault(row.encryptedData,sharedSecret(event),`project-contract:${id}:${row.id}`,1)),id:row.id,revision:row.revision})) as StoredProjectContract[]}
}
export async function checkProjectContractReferences(event:H3Event,context:Context,id:string,content:EstimateContent){
 const{contracts}=await storedProjectContracts(event,context,id)
 for(const contract of contracts){const result=contractFigures(content,contract);if(result.issue)throw createError({statusCode:400,message:`Договор «${contract.number}»: ${result.issue}. Сначала измените договор.`})}
}
export async function projectContractRegistry(event:H3Event){
 const context=await requireProjectsUser(event),id=projectId(event)
 for(let attempt=0;attempt<3;attempt++){
  const estimate=await projectEstimate(event),stored=await storedProjectContracts(event,context,id)
  if(estimate.revision!==stored.estimateRevision)continue
  return {estimate,contracts:stored.contracts.map(contract=>({...contract,...contractFigures(estimate,contract)})).sort((a,b)=>a.code.localeCompare(b.code,'ru',{numeric:true})||a.number.localeCompare(b.number,'ru'))}
 }
 throw createError({statusCode:409,message:'Смета изменилась во время загрузки. Обновите реестр.'})
}
export async function saveProjectContract(event:H3Event,id:string,revision:number,estimateRevision:number,contract?:ProjectContractInput){
 const context=await requireProjectsUser(event),project=projectId(event),estimate=await projectEstimate(event),existing=await storedProjectContracts(event,context,project)
 if(estimate.revision!==estimateRevision)throw createError({statusCode:409,message:'Смета изменилась. Обновите данные и повторите действие.'})
 if(revision>0&&!existing.contracts.some(row=>row.id===id))throw createError({statusCode:404,message:'Договор не найден'})
 if(contract){const result=contractFigures(estimate,contract),conflict=contractConflict(contract,existing.contracts,id);if(result.issue||conflict)throw createError({statusCode:400,message:result.issue||conflict})}
 const seller=estimate.counterparties.find(party=>party.id===contract?.sellerId),buyer=estimate.counterparties.find(party=>party.id===contract?.buyerId)
 const{error}=await context.client.rpc('project_contract_mutate',{p_actor:context.user.id,p_project:project,p_id:id,p_revision:revision,p_estimate_revision:estimateRevision,p_seller:seller?.catalogId??null,p_buyer:buyer?.catalogId??null,p_source:contract?.source??null,p_items:contract?.itemIds??[],p_data:contract?sealSharedVault(contract,sharedSecret(event),`project-contract:${project}:${id}`,1):null,p_delete:!contract})
 if(error)contractFailure(error)
 return {ok:true,id}
}
