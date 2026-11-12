import { registryRows,registryFiles } from '../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 const current=await registryFiles(event),rows=await registryRows(event)
 const contract=rows.find(row=>row.id===current.id&&row.origin===current.origin)
 if(!contract)throw createError({statusCode:404,message:'Договор не найден.'})
 return {contract,files:current.files}
})
