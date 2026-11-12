import { registryRows } from '../../utils/contract-register'
import { registerFilterSchema,filterRegisterContracts } from '../../../shared/utils/contract-register'
import { todayDate } from '../../../shared/utils/subscriptions'
export default defineEventHandler(async event=>{
 const parsed=registerFilterSchema.safeParse(getQuery(event))
 if(!parsed.success)throw createError({statusCode:400,message:'Проверьте фильтры, номер страницы и диапазон дат.'})
 const all=await registryRows(event)
 await cleanupRegistryFiles(await requireProjectsUser(event))
 if(parsed.data.legalEntityId!=='all'||parsed.data.counterpartyId!=='all'){
  const catalog=await listProjectCompanies(event,await requireProjectsUser(event))
  const normalize=(name:string)=>name.trim().toLocaleLowerCase('ru').replace(/ё/g,'е')
  for(const row of all)for(const role of ['seller','buyer'] as const){
   if(row[`${role}CatalogId`])continue
   const matches=catalog.filter(company=>normalize(company.company)===normalize(row[role]))
   if(matches.length===1)row[`${role}CatalogId`]=matches[0]!.id
  }
 }
 const filtered=filterRegisterContracts(all,parsed.data,todayDate()),pages=Math.max(1,Math.ceil(filtered.length/parsed.data.pageSize)),page=Math.min(parsed.data.page,pages)
 return {contracts:filtered.slice((page-1)*parsed.data.pageSize,page*parsed.data.pageSize),total:filtered.length,page,pages,pageSize:parsed.data.pageSize,projects:[...new Map(all.filter(r=>r.projectId).map(r=>[r.projectId,{id:r.projectId!,name:r.projectName}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))}
})
