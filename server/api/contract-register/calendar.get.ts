import { z } from 'zod'
import { registryRows } from '../../utils/contract-register'
import { registerFilterSchema,filterRegisterContracts } from '../../../shared/utils/contract-register'
import { contractCalendarSlice } from '../../../shared/utils/contract-calendar'
import { todayDate,validDate } from '../../../shared/utils/subscriptions'

export default defineEventHandler(async event=>{
  const {month,kind,...query}=getQuery(event)
  const calendar=z.object({month:z.string().refine(value=>/^\d{4}-\d{2}$/.test(value)&&validDate(value+'-01')&&Number(value.slice(0,4))>=1900&&Number(value.slice(0,4))<=9998),kind:z.enum(['all','date','deadline']).default('all')}).safeParse({month,kind})
  const filters=registerFilterSchema.safeParse(query)
  if(!calendar.success||!filters.success)throw createError({statusCode:400,message:'Проверьте месяц и фильтры календаря договоров.'})
  const all=await registryRows(event)
  if(filters.data.legalEntityId!=='all'||filters.data.counterpartyId!=='all'){
    const catalog=await listProjectCompanies(event,await requireProjectsUser(event))
    const normalize=(name:string)=>name.trim().toLocaleLowerCase('ru').replace(/ё/g,'е')
    for(const row of all)for(const role of ['seller','buyer'] as const){
      if(row[`${role}CatalogId`])continue
      const matches=catalog.filter(company=>normalize(company.company)===normalize(row[role]))
      if(matches.length===1)row[`${role}CatalogId`]=matches[0]!.id
    }
  }
  return {...contractCalendarSlice(filterRegisterContracts(all,filters.data,todayDate()),calendar.data.month,calendar.data.kind),projects:[...new Map(all.filter(row=>row.projectId).map(row=>[row.projectId,{id:row.projectId!,name:row.projectName}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))}
})
