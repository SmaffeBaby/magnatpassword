import { z } from 'zod'
import { registryId, registryOrigin, registryRows, registryFileSet } from '../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 const context=await requireProjectsUser(event),id=registryId(event),origin=registryOrigin(event)
 const {format}=await sharedBody(event,z.object({format:z.enum(['xlsx','pdf'])}).strict())
 const contract=(await registryRows(event)).find(row=>row.id===id&&row.origin===origin)
 if(!contract)throw createError({statusCode:404,message:'Договор не найден.'})
 const {files}=await registryFileSet(event,context,origin,id)
 const file=await renderEstimate({target:'contract-card',contract,files},format)
 setHeader(event,'Content-Type',format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 setHeader(event,'Content-Disposition',`attachment; filename="contract_${id}.${format}"`)
 setHeader(event,'Cache-Control','no-store')
 setHeader(event,'X-Content-Type-Options','nosniff')
 return file
})
