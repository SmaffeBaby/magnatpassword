import type { H3Event } from 'h3'
import { z } from 'zod'
import type { RegisterContract, RegisterFile, StandaloneContractInput } from '../../shared/types/contract-register'
import type { ContractFile } from '../../shared/types/project-contract-files'
import { standaloneContractSchema } from '../../shared/utils/contract-register'
import { normalizeEstimate, counterpartySchema } from '../../shared/utils/estimate'
import { contractFigures, projectContractSchema } from '../../shared/utils/project-contracts'
import { openSharedVault, sealSharedVault } from './shared-crypto'
export const registryBucket='contract-register'
export function registryFailure(error: {message:string;code?:string}): never {
  const cases:Record<string,[number,string]>={ACCESS_DENIED:[403,'Нет прав на это действие в реестре договоров.'],CONTRACT_NOT_FOUND:[404,'Договор не найден.'],FILE_NOT_FOUND:[404,'Файл не найден.'],FILE_LIMIT:[400,'К договору можно прикрепить до 20 файлов.'],REVISION_CONFLICT:[409,'Договор изменился. Обновите запись перед сохранением.']}
  const matched=Object.entries(cases).find(([key])=>error.message.includes(key))?.[1]
  throw createError({statusCode:matched?.[0]||503,message:matched?.[1]||'Не удалось загрузить или сохранить реестр договоров.'})
}
export function registryId(event:H3Event,name='id') {const id=z.uuid().safeParse(getRouterParam(event,name));if(!id.success)throw createError({statusCode:400,message:'Некорректный идентификатор.'});return id.data}
export function registryOrigin(event:H3Event) {const value=z.enum(['project','standalone']).safeParse(getRouterParam(event,'origin'));if(!value.success)throw createError({statusCode:400,message:'Некорректный источник договора.'});return value.data}
export function standaloneRow(event:H3Event,row:any,actor:string):RegisterContract {
  return {...standaloneContractSchema.parse(openSharedVault(row.encrypted_data,sharedSecret(event),`registry-contract:${row.id}`,1)),id:row.id,origin:'standalone',projectId:null,projectName:'',source:'manual',revision:row.revision,canEdit:row.owner_id===actor,canOpenProject:false,fileCount:Number(row.fileCount||0),issue:'',updatedAt:row.updated_at}
}
export async function registryRows(event:H3Event) {
  const context=await requireProjectsUser(event)
  const {data,error}=await context.client.rpc('contract_register_load',{p_actor:context.user.id})
  if(error)registryFailure(error)
  try {
    const rows:RegisterContract[]=[]
    for(const project of data.projects){
      const estimate=normalizeEstimate(project.estimate?openSharedVault(project.estimate,sharedSecret(event),`project-estimate:${project.id}`,1):{})
      if(project.migrated)estimate.counterparties=project.companies.map((c:any)=>({...counterpartySchema.parse(openSharedVault(c.encryptedData,sharedSecret(event),`project-company:${c.id}`,1)),id:c.localId,catalogId:c.id,isOwnLegalEntity:c.isOwnLegalEntity}))
      for(const row of project.contracts){
        const contract=projectContractSchema.parse(openSharedVault(row.encryptedData,sharedSecret(event),`project-contract:${project.id}:${row.id}`,1)),figures=contractFigures(estimate,contract)
        rows.push({sellerCatalogId:estimate.counterparties.find(p=>p.id===contract.sellerId)?.catalogId,buyerCatalogId:estimate.counterparties.find(p=>p.id===contract.buyerId)?.catalogId,id:row.id,origin:'project',projectId:project.id,projectName:project.name,source:contract.source,revision:row.revision,canEdit:false,canOpenProject:project.canOpen,fileCount:Number(row.fileCount),issue:figures.issue,updatedAt:'',noDeadline:contract.noDeadline,autoRenew:contract.autoRenew,code:contract.code,number:contract.number,seller:figures.seller,buyer:figures.buyer,date:contract.date,deadline:contract.deadline,amount:figures.amount,vatAmount:figures.vatAmount,notes:'',fields:contract.fields||[],registryRef:contract.registryRef})
      }
    }
    rows.push(...data.standalone.map((row:any)=>standaloneRow(event,row,context.user.id)))
    const byKey=new Map(rows.map(r=>[`${r.origin}/${r.id}`,r])),directCounts=new Map(rows.map(r=>[`${r.origin}/${r.id}`,r.fileCount]))
    function count(row:RegisterContract,seen=new Set<string>()):number {const key=`${row.origin}/${row.id}`;if(seen.has(key))return 0;seen.add(key);const source=row.registryRef&&byKey.get(`${row.registryRef.origin}/${row.registryRef.id}`);return (directCounts.get(key)||0)+(source?count(source,seen):0)}
    for(const row of rows)row.fileCount=count(row)
    return rows
  }catch{throw createError({statusCode:503,message:'Не удалось прочитать записи реестра. Повторите загрузку.'})}
}
export async function writeRegistryContract(event:H3Event,id:string,revision:number,value:StandaloneContractInput){
  const context=await requireProjectsUser(event)
  if(revision>0&&(value.noDeadline===undefined||value.autoRenew===undefined)){
    const {data,error}=await context.client.from('registry_contracts').select('encrypted_data,owner_id').eq('id',id).maybeSingle()
    if(error)registryFailure(error)
    if(data?.owner_id===context.user.id){
      const previous=standaloneContractSchema.parse(openSharedVault(data.encrypted_data,sharedSecret(event),`registry-contract:${id}`,1))
      value={...value,noDeadline:value.noDeadline??previous.noDeadline,autoRenew:value.autoRenew??previous.autoRenew}
    }
  }
  const parsed=standaloneContractSchema.safeParse(value)
  if(!parsed.success)throw createError({statusCode:400,message:parsed.error.issues[0]?.message||'Проверьте срок договора.'})
  value=parsed.data
  if(value.sellerCatalogId||value.buyerCatalogId){
    const catalog=await listProjectCompanies(event,context)
    value={...value}
    for(const role of ['seller','buyer'] as const){
      const catalogId=value[`${role}CatalogId`]
      if(!catalogId)continue
      const company=catalog.find(row=>row.id===catalogId)
      if(!company)throw createError({statusCode:400,message:'Выбранная компания больше недоступна. Выберите другую компанию из общей базы.'})
      value[role]=company.company
    }
  }
  const {data,error}=await context.client.rpc('registry_contract_write',{p_actor:context.user.id,p_id:id,p_revision:revision,p_data:sealSharedVault(value,sharedSecret(event),`registry-contract:${id}`,1)})
  if(error)registryFailure(error)
  return {id,revision:Number(data)}
}
export async function registryFileSet(event:H3Event,context:Awaited<ReturnType<typeof requireProjectsUser>>,origin:'project'|'standalone',id:string,write=false,seen:string[]=[]):Promise<{files:RegisterFile[];revision?:number;projectId?:string}> {
  const key=`${origin}/${id}`
  if(seen.includes(key)||seen.length>=10)throw createError({statusCode:409,message:'Связь договоров образует цикл или слишком длинную цепочку.'})
  const {data,error}=await context.client.rpc('registry_contract_files_access',{p_actor:context.user.id,p_origin:origin,p_contract:id,p_write:write})
  if(error)registryFailure(error)
  const files:RegisterFile[]=data.files.map((row:any)=>({...openSharedVault<ContractFile>(row.encryptedData,sharedSecret(event),origin==='project'?`contract-file:${data.projectId}:${id}:${row.id}`:`registry-file:${id}:${row.id}`,1),id:row.id,origin,contractId:id,...(data.projectId?{projectId:data.projectId}:{})}))
  if(!write&&origin==='project'&&data.contractData){
    const contract=projectContractSchema.parse(openSharedVault(data.contractData,sharedSecret(event),`project-contract:${data.projectId}:${id}`,1))
    if(contract.registryRef){const linked=await registryFileSet(event,context,contract.registryRef.origin,contract.registryRef.id,false,[...seen,key]);files.push(...linked.files)}
  }
  return {files:[...new Map(files.map(f=>[`${f.origin}/${f.contractId}/${f.id}`,f])).values()],revision:data.revision,projectId:data.projectId}
}
export async function registryFiles(event:H3Event,write=false){
  const context=await requireProjectsUser(event),id=registryId(event),origin=registryOrigin(event)
  return {context,id,origin,...await registryFileSet(event,context,origin,id,write)}
}
