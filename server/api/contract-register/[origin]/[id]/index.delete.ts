import { z } from 'zod'
import { registryId,registryOrigin,registryRows,registryFailure } from '../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 const context=await requireProjectsUser(event),id=registryId(event)
 if(registryOrigin(event)!=='standalone')throw createError({statusCode:403,message:'Договор проекта удаляется в разделе «Договора» соответствующего проекта.'})
 const {revision}=await sharedBody(event,z.object({revision:z.number().int().positive()}).strict())
 const rows=await registryRows(event),contract=rows.find(row=>row.origin==='standalone'&&row.id===id)
 if(!contract)throw createError({statusCode:404,message:'Договор не найден.'})
 if(!contract.canEdit)throw createError({statusCode:403,message:'Удалить договор может только его автор.'})
 if(rows.some(row=>row.registryRef?.origin==='standalone'&&row.registryRef.id===id))throw createError({statusCode:409,message:'Договор связан с проектом. Сначала уберите связь в договоре проекта.'})
 const {error}=await context.client.rpc('registry_contract_delete',{p_actor:context.user.id,p_id:id,p_revision:revision})
 if(error)registryFailure(error)
 const cleaned=await cleanupRegistryFiles(context)
 setHeader(event,'Cache-Control','no-store')
 return {ok:true,cleanupPending:!cleaned}
})
