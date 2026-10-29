import { z } from 'zod'
export default defineEventHandler(async event=>{
 const{estimate,contracts}=await projectContractRegistry(event),body=await sharedBody(event,z.object({format:z.enum(['xlsx','pdf'])}).strict())
 if(contracts.some(contract=>contract.issue))throw createError({statusCode:409,message:'Сначала исправьте договоры, требующие проверки.'})
 const file=await renderEstimate({...estimate,target:'contracts',contracts},body.format)
 setHeader(event,'Content-Type',body.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 setHeader(event,'Content-Disposition',`attachment; filename="contracts_${projectId(event)}.${body.format}"`)
 return file
})
